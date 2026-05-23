import { useState, useRef, useEffect, useCallback } from "react";
import {
  useTaskStore,
  checkSubscription,
  getTelegramUserId,
  saveChatHistory,
  loadChatHistory,
  loadChatFromFirebase,
  ChatMessage,
} from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { Send, Bot, Mic, MicOff, Copy, Check } from "lucide-react";

const ASSISTANT_NAME_KEY = "cortex-assistant-name";
const AI_FREE_LIMIT = 5;
const AI_USAGE_KEY = "cortex-ai-usage";
const AI_WORKER_URL = "https://ancient-river-8a20.bubo-buboff.workers.dev";

function getAssistantName() {
  return localStorage.getItem(ASSISTANT_NAME_KEY) || "CortexAI";
}

function getAiUsage(): number {
  try {
    const s = localStorage.getItem(AI_USAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      if (p.date === new Date().toISOString().split("T")[0]) return p.count;
    }
  } catch {}
  return 0;
}

function setAiUsageStorage(count: number) {
  localStorage.setItem(
    AI_USAGE_KEY,
    JSON.stringify({ date: new Date().toISOString().split("T")[0], count })
  );
}

const DEFAULT_MESSAGE = (ru: boolean, name: string): ChatMessage => ({
  role: "assistant",
  content: ru
    ? `Привет! 👋 Я ${name}, твой АИ Агент.\n\nЯ умею:\n• Создавать задачи: "напомни завтра в 10 встреча"\n• Добавлять покупки: "купить молоко"\n• Показывать план: "что у меня сегодня?"\n• 🎤 Принимать голосовые команды\n\n💡 Мотивация и профиль — Ещё → Настройки`
    : `Hi! 👋 I'm ${name}, your AI Agent.\n\nI can:\n• Create tasks: "remind tomorrow at 10 meeting"\n• Add shopping: "buy milk"\n• Show plan: "what today?"\n• 🎤 Voice commands\n\n💡 Motivation & profile: More → Settings`,
  timestamp: Date.now(),
});

interface Props {
  embedded?: boolean;
}

export default function AiProcessPage({ embedded = false }: Props) {
  const language = useI18nStore((s) => s.language);
  const tasks = useTaskStore((s) => s.tasks);
  const addTask = useTaskStore((s) => s.addTask);
  const ru = language === "ru";

  const [name, setName] = useState(getAssistantName);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [newName, setNewName] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadChatHistory();
    return saved.length > 0 ? (saved as ChatMessage[]) : [DEFAULT_MESSAGE(ru, getAssistantName())];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSub, setHasSub] = useState<boolean | null>(null);
  const [usage, setUsage] = useState(() => getAiUsage());
  const [chatLoaded, setChatLoaded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const sendingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userId = getTelegramUserId();

  // ─── Загрузка данных ───────────────────────────────────────────────────────
  useEffect(() => {
    checkSubscription(userId).then(setHasSub);
    if (userId !== "unknown") {
      loadChatFromFirebase(userId, "ai-assistant").then((msgs) => {
        if (msgs.length > 0) setMessages(msgs as ChatMessage[]);
        setChatLoaded(true);
      });
    } else {
      setChatLoaded(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasSub === true) setUsage(0);
  }, [hasSub]);

  useEffect(() => {
    if (chatLoaded) saveChatHistory(messages);
  }, [messages, chatLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Автовысота textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
  }, [input]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  const isLimited = hasSub === false && usage >= AI_FREE_LIMIT;

  // ─── Голос ─────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      (window as any).Telegram?.WebApp?.showAlert(
        ru ? "Голосовой ввод не поддерживается в этом браузере" : "Voice input not supported in this browser"
      );
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    const r = new SR();
    r.lang = ru ? "ru-RU" : "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => setIsListening(true);
    r.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
      recognitionRef.current = null;
    };
    r.onerror = () => { setIsListening(false); recognitionRef.current = null; };
    r.onend = () => { setIsListening(false); recognitionRef.current = null; };
    recognitionRef.current = r;
    r.start();
  }, [ru]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  // ─── Копирование ───────────────────────────────────────────────────────────
  const copyMessage = async (content: string, i: number) => {
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
    setCopiedId(i);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Отправка ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text?: string) => {
    if (sendingRef.current) return;
    const msg = (text || input).trim();
    if (!msg || loading) return;

    if (isLimited) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(
        ru
          ? `Достигнут лимит ${AI_FREE_LIMIT} запросов в день 🤖\nОформи подписку для безлимитного использования!`
          : `Daily limit of ${AI_FREE_LIMIT} requests reached 🤖\nGet subscription for unlimited use!`
      );
      tg?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
      return;
    }

    sendingRef.current = true;
    setMessages((p) => [...p, { role: "user", content: msg, timestamp: Date.now() }]);
    setInput("");
    setLoading(true);

    if (hasSub === false) {
      const nc = usage + 1;
      setUsage(nc);
      setAiUsageStorage(nc);
    }

    try {
      const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 8);
      const systemPrompt = `Ты АИ Агент планировщика CortexAI. Текущее время: ${new Date().toLocaleString("ru-RU")}.
Активные задачи пользователя: ${
        activeTasks.length > 0
          ? activeTasks
              .map(
                (t) =>
                  `${t.title}${
                    t.dueDate
                      ? ` (${new Date(t.dueDate).toLocaleString("ru-RU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })})`
                      : " (без даты)"
                  }`
              )
              .join(", ")
          : "нет задач"
      }
ВАЖНО: Если пользователь хочет создать задачу или напоминание — добавь в самый конец ответа:
TASK_JSON:{"title":"название задачи","dueDate":"ISO-дата или null","priority":"low|medium|high","repeat":"none|daily|weekdays|weekends"}
Правила:
- Отвечай коротко (1-3 предложения)
- ${ru ? "Только на русском языке" : "Only in English"}
- Используй эмодзи
- dueDate=null если пользователь не указал конкретное время
- Если создаёшь задачу — ОБЯЗАТЕЛЬНО добавь TASK_JSON в конец`;

      const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      history.push({ role: "user", content: msg });

      const res = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, systemPrompt }),
      });

      if (!res.ok) throw new Error(`Worker error ${res.status}`);
      const data = await res.json();
      const aiResponse: string = data.content || "";

      // Парсим задачу — улучшенный regex
      const match = aiResponse.match(/TASK_JSON:\s*(\{[\s\S]*?\})\s*$/);
      let finalText = aiResponse.replace(/TASK_JSON:\s*\{[\s\S]*?\}\s*$/, "").trim();

      if (match) {
        try {
          const task = JSON.parse(match[1]);
          if (task.title && task.title.length > 1) {
            let dueDate: string | undefined;
            if (task.dueDate && task.dueDate !== "null") {
              const d = new Date(task.dueDate);
              if (!isNaN(d.getTime()) && d > new Date()) dueDate = task.dueDate;
            }
            await addTask({
              title: task.title,
              dueDate,
              priority: task.priority || "medium",
              status: "todo",
              isAiCreated: true,
              repeat: task.repeat || "none",
              type: "task",
              description: "",
              items: [],
            });
            const timeStr = dueDate
              ? new Date(dueDate).toLocaleString(ru ? "ru-RU" : "en-US", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ru ? "без срока" : "no deadline";
            finalText = `✅ ${ru ? "Задача добавлена" : "Task added"}!\n📌 ${task.title}\n⏰ ${timeStr}\n\n${finalText}`;
          }
        } catch (e) {
          console.warn("TASK_JSON parse error:", e);
        }
      }

      setMessages((p) => [
        ...p,
        { role: "assistant", content: finalText || aiResponse, timestamp: Date.now() },
      ]);
    } catch (err) {
      console.error("AI request error:", err);
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          content: ru
            ? "⚠️ Ошибка соединения. Проверь интернет и попробуй ещё раз."
            : "⚠️ Connection error. Check internet and try again.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }, [input, loading, isLimited, hasSub, usage, tasks, messages, addTask, ru]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Сохранение имени ──────────────────────────────────────────────────────
  const saveName = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    localStorage.setItem(ASSISTANT_NAME_KEY, trimmed);
    setName(trimmed);
    setShowNameEdit(false);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: embedded ? "100%" : "calc(var(--vh, 1vh) * 100 - 120px)",
        flex: embedded ? 1 : undefined,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* ── Заголовок ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "8px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "12px",
            backgroundColor: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Bot size={20} color="#3b82f6" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "white", margin: 0 }}>{name}</p>
            <span
              style={{
                fontSize: "10px",
                backgroundColor: "rgba(59,130,246,0.2)",
                color: "#60a5fa",
                padding: "1px 7px",
                borderRadius: "8px",
                fontWeight: 600,
              }}
            >
              АИ Агент ⚡
            </span>
            <button
              onClick={() => { setNewName(name); setShowNameEdit(true); }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                padding: "0",
                color: "rgba(255,255,255,0.3)",
              }}
              title={ru ? "Изменить имя" : "Edit name"}
            >
              ✏️
            </button>
          </div>
          <p
            style={{
              fontSize: "11px",
              color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.4)",
              margin: 0,
            }}
          >
            {hasSub === null
              ? (ru ? "Проверяем подписку..." : "Checking subscription...")
              : hasSub
              ? (ru ? "Подписка активна ✅" : "Subscription active ✅")
              : isLimited
              ? (ru ? `Лимит ${AI_FREE_LIMIT} запросов/день` : `Limit ${AI_FREE_LIMIT} req/day`)
              : `${AI_FREE_LIMIT - usage}/${AI_FREE_LIMIT} ${ru ? "запросов" : "requests"}`}
          </p>
        </div>
      </div>

      {/* ── Редактирование имени ── */}
      {showNameEdit && (
        <div
          style={{
            backgroundColor: "rgba(59,130,246,0.1)",
            border: "1px solid rgba(59,130,246,0.25)",
            borderRadius: "12px",
            padding: "10px 12px",
            marginBottom: "8px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); }}
              placeholder={ru ? "Имя ассистента..." : "Assistant name..."}
              autoFocus
              style={{
                flex: 1,
                height: "36px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.15)",
                backgroundColor: "rgba(255,255,255,0.07)",
                paddingLeft: "10px",
                fontSize: "14px",
                color: "white",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={saveName}
              style={{
                height: "36px",
                paddingLeft: "14px",
                paddingRight: "14px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#3b82f6",
                color: "white",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              OK
            </button>
            <button
              onClick={() => setShowNameEdit(false)}
              style={{
                height: "36px",
                paddingLeft: "10px",
                paddingRight: "10px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "transparent",
                color: "rgba(255,255,255,0.5)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Баннер лимита ── */}
      {isLimited && (
        <div
          style={{
            backgroundColor: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "8px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <p style={{ fontSize: "12px", color: "#fca5a5", margin: 0 }}>
            {ru ? `Лимит ${AI_FREE_LIMIT} запросов/день 🤖` : `Limit ${AI_FREE_LIMIT} req/day 🤖`}
          </p>
          <button
            onClick={() =>
              (window as any).Telegram?.WebApp?.openTelegramLink(
                "https://t.me/aiplannerrubot?start=subscribe"
              )
            }
            style={{
              height: "30px",
              paddingLeft: "14px",
              paddingRight: "14px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#3b82f6",
              color: "white",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {ru ? "Подписка" : "Subscribe"}
          </button>
        </div>
      )}

      {/* ── Быстрые подсказки ── */}
      {messages.length <= 1 && !isLimited && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            overflowX: "auto",
            marginBottom: "8px",
            paddingBottom: "2px",
            flexShrink: 0,
          }}
        >
          {(ru
            ? ["что у меня сегодня?", "напомни завтра утром", "купить продукты", "план на неделю"]
            : ["what today?", "remind tomorrow morning", "buy groceries", "weekly plan"]
          ).map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              style={{
                whiteSpace: "nowrap",
                backgroundColor: "rgba(59,130,246,0.12)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: "16px",
                padding: "5px 12px",
                fontSize: "11px",
                color: "#93c5fd",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* ── Лента сообщений ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch" as any,
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          paddingBottom: "8px",
          minHeight: 0,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div style={{ maxWidth: "85%", position: "relative", paddingBottom: "20px" }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius:
                    msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  backgroundColor:
                    msg.role === "user" ? "#3b82f6" : "rgba(255,255,255,0.07)",
                  border:
                    msg.role === "assistant"
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "none",
                }}
              >
                <p
                  style={{
                    fontSize: "14px",
                    color: msg.role === "user" ? "white" : "rgba(255,255,255,0.9)",
                    margin: 0,
                    lineHeight: "1.55",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}
                </p>
              </div>
              <button
                onClick={() => copyMessage(msg.content, i)}
                style={{
                  position: "absolute",
                  bottom: "2px",
                  right: msg.role === "user" ? "0" : "auto",
                  left: msg.role === "assistant" ? "0" : "auto",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "2px 4px",
                }}
              >
                {copiedId === i ? (
                  <>
                    <Check size={10} color="#22c55e" />
                    <span style={{ fontSize: "9px", color: "#22c55e" }}>
                      {ru ? "Скопировано" : "Copied"}
                    </span>
                  </>
                ) : (
                  <Copy size={10} color="rgba(255,255,255,0.2)" />
                )}
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "18px 18px 18px 4px",
                backgroundColor: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                gap: "5px",
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255,255,255,0.5)",
                    animation: `aiBounce 1s ease-in-out ${i * 0.18}s infinite`,
                  }}
                />
              ))}
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginLeft: "4px" }}>
                {ru ? "Думаю..." : "Thinking..."}
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Поле ввода ── */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "flex-end",
          paddingTop: "10px",
          paddingBottom: "4px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
          backgroundColor: "transparent",
        }}
      >
        {/* Кнопка микрофона */}
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isLimited}
          title={
            isListening
              ? (ru ? "Остановить запись" : "Stop recording")
              : (ru ? "Голосовой ввод" : "Voice input")
          }
          style={{
            width: "42px",
            height: "42px",
            minWidth: "42px",
            borderRadius: "50%",
            backgroundColor: isListening ? "#ef4444" : "rgba(255,255,255,0.08)",
            border: isListening ? "2px solid #fca5a5" : "1px solid rgba(255,255,255,0.1)",
            cursor: isLimited ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            opacity: isLimited ? 0.35 : 1,
            transition: "all 0.2s",
          }}
        >
          {isListening ? (
            <MicOff size={17} color="white" />
          ) : (
            <Mic size={17} color="rgba(255,255,255,0.7)" />
          )}
        </button>

        {/* Поле ввода текста */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={
            isListening
              ? (ru ? "🎤 Говорите..." : "🎤 Speaking...")
              : isLimited
              ? (ru ? "Лимит запросов исчерпан" : "Request limit reached")
              : (ru ? "Напишите задачу или вопрос..." : "Write a task or question...")
          }
          disabled={isLimited}
          rows={1}
          style={{
            flex: 1,
            backgroundColor: isListening
              ? "rgba(239,68,68,0.1)"
              : isLimited
              ? "rgba(255,255,255,0.03)"
              : "rgba(255,255,255,0.07)",
            border: isListening
              ? "1px solid rgba(239,68,68,0.4)"
              : "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            padding: "10px 14px",
            fontSize: "15px",
            color: isLimited ? "rgba(255,255,255,0.3)" : "white",
            outline: "none",
            resize: "none",
            maxHeight: "100px",
            overflowY: "auto",
            boxSizing: "border-box",
            fontFamily: "inherit",
            lineHeight: "1.4",
            transition: "border-color 0.2s, background-color 0.2s",
          }}
        />

        {/* Кнопка отправки */}
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading || isLimited}
          title={ru ? "Отправить" : "Send"}
          style={{
            width: "42px",
            height: "42px",
            minWidth: "42px",
            borderRadius: "50%",
            backgroundColor:
              input.trim() && !loading && !isLimited
                ? "#3b82f6"
                : "rgba(255,255,255,0.08)",
            border: "none",
            cursor:
              input.trim() && !loading && !isLimited ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background-color 0.2s",
          }}
        >
          <Send size={16} color="white" />
        </button>
      </div>

      <style>{`
        @keyframes aiBounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-5px); opacity: 1; }
        }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
        textarea:disabled { cursor: not-allowed; }
      `}</style>
    </div>
  );
}
