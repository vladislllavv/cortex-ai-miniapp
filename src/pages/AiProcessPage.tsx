import { useState, useRef, useEffect } from "react";
import {
  useTaskStore,
  checkSubscription,
  getTelegramUserId,
  saveChatHistory,
  loadChatHistory,
  isHoliday,
  isWeekend,
  getHolidayName,
} from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { Send, Bot, Mic, MicOff, Copy, Check } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

const ASSISTANT_NAME_KEY = "cortex-assistant-name";
const AI_FREE_LIMIT = 5;
const AI_USAGE_KEY = "cortex-ai-usage";

// URL Cloudflare Worker — ключ скрыт на сервере Cloudflare
const AI_WORKER_URL = "https://ancient-river-8a20.bubo-buboff.workers.dev";

function getAssistantName(): string {
  return localStorage.getItem(ASSISTANT_NAME_KEY) || "CortexAI";
}

function getAiUsage(): number {
  try {
    const stored = localStorage.getItem(AI_USAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const today = new Date().toISOString().split("T")[0];
      if (parsed.date === today) return parsed.count;
    }
  } catch {}
  return 0;
}

function setAiUsage(count: number) {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem(AI_USAGE_KEY, JSON.stringify({ date: today, count }));
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

function parseTaskFromResponse(response: string): {
  text: string;
  task: { title: string; dueDate?: string; priority: string; repeat: string } | null;
} {
  const taskJsonMatch = response.match(/TASK_JSON:(\{[^}]+\})/);
  if (taskJsonMatch) {
    try {
      const task = JSON.parse(taskJsonMatch[1]);
      const text = response.replace(/TASK_JSON:\{[^}]+\}/, "").trim();
      return { text, task };
    } catch {}
  }
  return { text: response, task: null };
}

const DEFAULT_MESSAGE = (ru: boolean, name: string): Message => ({
  role: "assistant",
  content: ru
    ? `Привет! 👋 Я ${name}, твой AI ассистент на базе Llama 3.3.\n\nМогу помочь:\n• Создать задачу: "напомни завтра в 10 встреча"\n• Показать план: "что у меня сегодня?"\n• Дать совет по продуктивности\n• Снизить стресс 🧘\n• 🎤 Голосовой ввод\n\n⚠️ Задачи с датой автоматически попадают в список и календарь`
    : `Hi! 👋 I'm ${name}, your AI assistant powered by Llama 3.3.\n\nI can help:\n• Create tasks: "remind me tomorrow at 10 meeting"\n• Show plan: "what do I have today?"\n• Give productivity advice\n• Reduce stress 🧘\n• 🎤 Voice input\n\n⚠️ Tasks with dates automatically appear in your list and calendar`,
});

export default function AiProcessPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const addTask = useTaskStore((state) => state.addTask);
  const ru = language === "ru";

  const [assistantName, setAssistantName] = useState(getAssistantName());
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [newName, setNewName] = useState("");

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadChatHistory();
    if (saved.length > 0) return saved as Message[];
    return [DEFAULT_MESSAGE(ru, getAssistantName())];
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [aiUsageCount, setAiUsageCount] = useState(() => getAiUsage());

  const sendingRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userId = getTelegramUserId();
    checkSubscription(userId).then(setHasSubscription);
  }, []);

  useEffect(() => {
    if (hasSubscription === true) setAiUsageCount(0);
  }, [hasSubscription]);

  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setIsListening(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(ru ? "Голосовой ввод не поддерживается" : "Voice input not supported");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = ru ? "ru-RU" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      setInput(event.results[0][0].transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const el = document.createElement("textarea");
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(index);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const saveName = () => {
    if (!newName.trim()) return;
    localStorage.setItem(ASSISTANT_NAME_KEY, newName.trim());
    setAssistantName(newName.trim());
    setNewName("");
    setShowNameEdit(false);
  };

  const quickQuestions = ru
    ? ["что у меня сегодня?", "напомни завтра утром", "я в стрессе", "оптимизируй задачи"]
    : ["what do I have today?", "remind tomorrow morning", "I'm stressed", "optimize tasks"];

  const sendMessage = async (text?: string) => {
    if (sendingRef.current) return;
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    if (hasSubscription === false && aiUsageCount >= AI_FREE_LIMIT) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(
        ru
          ? `Лимит ${AI_FREE_LIMIT} запросов в день 🤖\n\nОформи подписку (100 Stars/мес).\n\nНапиши боту /subscribe`
          : `Daily limit of ${AI_FREE_LIMIT} requests reached.\n\nGet subscription.\n\nSend /subscribe`
      );
      tg?.openTelegramLink("https://t.me/aiplannerrubot");
      return;
    }

    sendingRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content: messageText }]);
    setInput("");
    setLoading(true);

    if (hasSubscription === false) {
      const newCount = aiUsageCount + 1;
      setAiUsageCount(newCount);
      setAiUsage(newCount);
    }

    try {
      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 8);

      // Системный промпт
      const systemPrompt = `Ты AI ассистент планировщика CortexAI. Время: ${now.toLocaleString("ru-RU")}.

Активные задачи: ${activeTasks.length > 0
        ? activeTasks.map(t => `${t.title}${t.dueDate ? ` (${new Date(t.dueDate).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}`).join(", ")
        : "нет задач"}

Если пользователь хочет создать задачу/напоминание — добавь в конец:
TASK_JSON:{"title":"название","dueDate":"ISO_дата_или_null","priority":"medium","repeat":"none"}

Правила:
- Отвечай коротко (2-3 предложения)
- ${ru ? "Только на русском" : "Only in English"}
- Используй эмодзи
- priority: low/medium/high, repeat: none/daily
- Если нет времени — спроси когда напомнить`;

      // История — последние 6 сообщений
      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      history.push({ role: "user", content: messageText });

      // Запрос к Cloudflare Worker — быстро и безопасно
      const startTime = Date.now();
      const response = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, systemPrompt }),
      });

      console.log(`⏱ AI ответил за ${Date.now() - startTime}ms`);

      if (!response.ok) {
        throw new Error(`Worker error: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const aiResponse = data.content;
      const { text, task } = parseTaskFromResponse(aiResponse);

      // Если AI создал задачу — добавляем в store
      if (task && task.title && task.title.length > 1) {
        await addTask({
          title: task.title,
          dueDate: task.dueDate || undefined,
          priority: (task.priority || "medium") as any,
          status: "todo",
          isAiCreated: true,
          repeat: (task.repeat || "none") as any,
          type: "task",
          description: "",
          items: [],
        });

        // Если есть дата — сохраняем в Firebase для уведомлений бота
        if (task.dueDate) {
          const userId = getTelegramUserId();
          if (userId !== "unknown") {
            const { Timestamp, addDoc, collection } = await import("firebase/firestore");
            const dueDate = new Date(task.dueDate);
            if (!isNaN(dueDate.getTime())) {
              addDoc(collection(db, "tasks"), {
                userId,
                taskId: `ai_${Date.now()}`,
                title: task.title,
                description: "",
                dueDate: task.dueDate,
                priority: task.priority || "medium",
                status: "todo",
                createdAt: new Date().toISOString(),
                isSent: false,
                reminderAt: Timestamp.fromDate(dueDate),
                repeat: task.repeat || "none",
                type: "task",
              }).catch(console.error);
            }
          }
        }

        const confirmMsg = ru
          ? `✅ Задача создана: "${task.title}"\n\n${text}`
          : `✅ Task created: "${task.title}"\n\n${text}`;

        setMessages((prev) => [...prev, { role: "assistant", content: confirmMsg }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: text }]);
      }
    } catch (err: any) {
      console.error("AI error:", err);
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: ru
          ? "⚠️ Ошибка подключения к AI. Попробуй ещё раз."
          : "⚠️ AI connection error. Please try again.",
      }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const isLimited = hasSubscription === false && aiUsageCount >= AI_FREE_LIMIT;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxHeight: "calc(100vh - 120px)", overflow: "hidden" }}>

      {/* Заголовок */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexShrink: 0 }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Bot size={18} color="#3b82f6" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "white", margin: 0 }}>{assistantName}</p>
            <span style={{ fontSize: "10px", backgroundColor: "rgba(59,130,246,0.2)", color: "#60a5fa", padding: "1px 6px", borderRadius: "8px" }}>
              Llama 3.3 ⚡
            </span>
            <button onClick={() => { setNewName(assistantName); setShowNameEdit(true); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>✏️</button>
          </div>
          <p style={{ fontSize: "11px", color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.4)", margin: 0 }}>
            {hasSubscription === null ? (ru ? "Загрузка..." : "Loading...") :
              hasSubscription ? (ru ? "Подписка активна ✅" : "Subscription active ✅") :
              isLimited ? (ru ? "Лимит исчерпан" : "Limit reached") :
              ru ? `${AI_FREE_LIMIT - aiUsageCount} из ${AI_FREE_LIMIT} запросов` : `${AI_FREE_LIMIT - aiUsageCount} of ${AI_FREE_LIMIT} requests`}
          </p>
        </div>
      </div>

      {/* Редактирование имени */}
      {showNameEdit && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px", flexShrink: 0 }}>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>{ru ? "Имя ассистента" : "Assistant name"}</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} placeholder={ru ? "Введи имя..." : "Enter name..."} style={{ flex: 1, height: "34px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "10px", paddingRight: "10px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit" }} />
            <button onClick={saveName} style={{ height: "34px", paddingLeft: "12px", paddingRight: "12px", borderRadius: "8px", border: "none", backgroundColor: "#3b82f6", color: "white", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>{ru ? "Сохранить" : "Save"}</button>
            <button onClick={() => setShowNameEdit(false)} style={{ height: "34px", paddingLeft: "10px", paddingRight: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", color: "rgba(255,255,255,0.5)", fontSize: "12px", cursor: "pointer" }}>✕</button>
          </div>
        </div>
      )}

      {/* Лимит */}
      {isLimited && (
        <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "8px 12px", marginBottom: "8px", flexShrink: 0, textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: "#fca5a5", margin: "0 0 6px 0" }}>{ru ? `Лимит ${AI_FREE_LIMIT} запросов в день 🤖` : `Daily limit of ${AI_FREE_LIMIT} requests 🤖`}</p>
          <button onClick={() => { const tg = (window as any).Telegram?.WebApp; tg?.openTelegramLink("https://t.me/aiplannerrubot"); }} style={{ height: "30px", paddingLeft: "14px", paddingRight: "14px", borderRadius: "8px", border: "none", backgroundColor: "#3b82f6", color: "white", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
            {ru ? "Оформить подписку" : "Get subscription"}
          </button>
        </div>
      )}

      {/* Быстрые вопросы */}
      {messages.length <= 1 && (
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "8px", paddingBottom: "2px", flexShrink: 0 }}>
          {quickQuestions.map((q) => (
            <button key={q} onClick={() => sendMessage(q)} style={{ whiteSpace: "nowrap", backgroundColor: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "16px", padding: "5px 10px", fontSize: "11px", color: "#93c5fd", cursor: "pointer", flexShrink: 0 }}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Сообщения */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" as any, display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "4px", minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", position: "relative" }}>
              <div style={{ padding: "9px 13px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", backgroundColor: msg.role === "user" ? "#3b82f6" : "rgba(255,255,255,0.07)", border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <p style={{ fontSize: "14px", color: msg.role === "user" ? "white" : "rgba(255,255,255,0.9)", margin: 0, lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.content}
                </p>
              </div>
              <button onClick={() => copyMessage(msg.content, i)} style={{ position: "absolute", bottom: "-18px", right: msg.role === "user" ? "0" : "auto", left: msg.role === "assistant" ? "0" : "auto", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px", padding: "2px 4px" }}>
                {copiedId === i
                  ? <><Check size={11} color="#22c55e" /><span style={{ fontSize: "10px", color: "#22c55e" }}>{ru ? "Скопировано" : "Copied"}</span></>
                  : <Copy size={11} color="rgba(255,255,255,0.2)" />}
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "4px", alignItems: "center" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.4)", animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginLeft: "4px" }}>
                {ru ? "Думаю..." : "Thinking..."}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isLimited}
          style={{ width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%", backgroundColor: isListening ? "#ef4444" : "rgba(255,255,255,0.08)", border: isListening ? "2px solid #fca5a5" : "none", cursor: isLimited ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: isLimited ? 0.3 : 1 }}
        >
          {isListening ? <MicOff size={16} color="white" /> : <Mic size={16} color="rgba(255,255,255,0.6)" />}
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={
            isListening ? (ru ? "Говори..." : "Speaking...") :
            isLimited ? (ru ? "Лимит исчерпан..." : "Limit reached...") :
            ru ? "Напиши задачу или вопрос..." : "Write task or question..."
          }
          disabled={isLimited}
          rows={1}
          style={{ flex: 1, backgroundColor: isListening ? "rgba(239,68,68,0.1)" : isLimited ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)", border: isListening ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "10px 12px", fontSize: "16px", color: isLimited ? "rgba(255,255,255,0.3)" : "white", outline: "none", resize: "none", maxHeight: "70px", overflowY: "auto", boxSizing: "border-box", fontFamily: "inherit" }}
        />

        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading || isLimited}
          style={{ width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%", backgroundColor: input.trim() && !loading && !isLimited ? "#3b82f6" : "rgba(255,255,255,0.08)", border: "none", cursor: input.trim() && !loading && !isLimited ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <Send size={15} color="white" />
        </button>
      </div>

      <style>{`
        @keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-4px); opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
      `}</style>
    </div>
  );
}
