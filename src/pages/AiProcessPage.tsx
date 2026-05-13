import { useState, useRef, useEffect } from "react";
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
import { Send, Bot, Mic, MicOff, Copy, Check, Settings, X } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

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

type MotivationMode = "off" | "soft" | "normal" | "hard";

interface MotivationSettings {
  mode: MotivationMode;
  timesPerDay: number;
  enabled: boolean;
}

const MOTIVATION_MODES = {
  off:    { label: "Выключено", labelEn: "Off",    desc: "Уведомления не приходят",          descEn: "No notifications",        emoji: "🔕" },
  soft:   { label: "Мягкий",    labelEn: "Soft",   desc: "Добрые и поддерживающие слова",    descEn: "Kind and supportive",      emoji: "🌸" },
  normal: { label: "Обычный",   labelEn: "Normal", desc: "Сбалансированная мотивация",       descEn: "Balanced motivation",      emoji: "⚡" },
  hard:   { label: "Жёсткий",   labelEn: "Hard",   desc: "Прямо и требовательно",            descEn: "Direct and demanding",     emoji: "🔥" },
} as const;

async function loadMotivationSettings(userId: string): Promise<MotivationSettings> {
  const def: MotivationSettings = { mode: "normal", timesPerDay: 3, enabled: false };
  if (userId === "unknown") return def;
  try {
    const s = await getDoc(doc(db, "users", userId, "settings", "motivation"));
    if (s.exists()) return { ...def, ...s.data() as MotivationSettings };
  } catch {}
  return def;
}

async function saveMotivationSettingsDb(userId: string, s: MotivationSettings) {
  if (userId === "unknown") return;
  await setDoc(doc(db, "users", userId, "settings", "motivation"), s);
}

const DEFAULT_MESSAGE = (ru: boolean, name: string): ChatMessage => ({
  role: "assistant",
  content: ru
    ? `Привет! 👋 Я ${name}, твой AI ассистент.\n\n• "напомни завтра в 10 встреча"\n• "купить молоко"\n• "что у меня сегодня?"\n• 🎤 Голосовой ввод\n\n⚙️ Настройки мотивации`
    : `Hi! 👋 I'm ${name}.\n\n• "remind tomorrow at 10 meeting"\n• "buy milk"\n• "what today?"\n• 🎤 Voice input\n\n⚙️ Motivation settings`,
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

  const [name, setName] = useState(getAssistantName());
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [showMotivation, setShowMotivation] = useState(false);
  const [newName, setNewName] = useState("");
  const [motivation, setMotivation] = useState<MotivationSettings>({
    mode: "normal", timesPerDay: 3, enabled: false,
  });
  const [motivationLoading, setMotivationLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadChatHistory();
    return saved.length > 0 ? saved as ChatMessage[] : [DEFAULT_MESSAGE(ru, getAssistantName())];
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
  const userId = getTelegramUserId();

  useEffect(() => {
    checkSubscription(userId).then(setHasSub);
    loadMotivationSettings(userId).then(setMotivation);
    if (userId !== "unknown") {
      loadChatFromFirebase(userId, "ai-assistant").then((msgs) => {
        if (msgs.length > 0) setMessages(msgs as ChatMessage[]);
        setChatLoaded(true);
      });
    } else {
      setChatLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (hasSub === true) setUsage(0);
  }, [hasSub]);

  useEffect(() => {
    if (chatLoaded) saveChatHistory(messages);
  }, [messages, chatLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
  }, []);

  const isLimited = hasSub === false && usage >= AI_FREE_LIMIT;

  async function saveMotivation(s: MotivationSettings) {
    const tg = (window as any).Telegram?.WebApp;
    if (s.enabled && s.mode !== "off" && tg) {
      setMotivationLoading(true);
      tg.requestWriteAccess(async (granted: boolean) => {
        if (granted) {
          setMotivation(s);
          await saveMotivationSettingsDb(userId, s);
          setMessages((p) => [...p, {
            role: "assistant",
            content: ru
              ? `${MOTIVATION_MODES[s.mode].emoji} Мотивация настроена! Режим: ${MOTIVATION_MODES[s.mode].label}, ${s.timesPerDay}× в день 💪`
              : `${MOTIVATION_MODES[s.mode].emoji} Motivation set! Mode: ${MOTIVATION_MODES[s.mode].labelEn}, ${s.timesPerDay}×/day 💪`,
            timestamp: Date.now(),
          }]);
          tg.showAlert(ru ? "✅ Мотивация включена!" : "✅ Motivation enabled!");
        } else {
          tg.showAlert(ru ? "❌ Доступ отклонён." : "❌ Access denied.");
        }
        setMotivationLoading(false);
        setShowMotivation(false);
      });
    } else {
      setMotivation(s);
      await saveMotivationSettingsDb(userId, s);
      setMotivationLoading(false);
      setShowMotivation(false);
    }
  }

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { (window as any).Telegram?.WebApp?.showAlert(ru ? "Голосовой ввод не поддерживается" : "Voice not supported"); return; }
    const r = new SR();
    r.lang = ru ? "ru-RU" : "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => setIsListening(true);
    r.onresult = (e: any) => { setInput(e.results[0][0].transcript); setIsListening(false); };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    recognitionRef.current = r;
    r.start();
  };

  const stopListening = () => {
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setIsListening(false);
  };

  const copyMessage = async (content: string, i: number) => {
    try { await navigator.clipboard.writeText(content); } catch {
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

  const sendMessage = async (text?: string) => {
    if (sendingRef.current) return;
    const msg = (text || input).trim();
    if (!msg || loading) return;

    if (isLimited) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(ru ? `Лимит ${AI_FREE_LIMIT} запросов 🤖` : `Limit ${AI_FREE_LIMIT} 🤖`);
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
      const systemPrompt = `Ты AI ассистент планировщика CortexAI. Время: ${new Date().toLocaleString("ru-RU")}.
Активные задачи: ${activeTasks.length > 0
        ? activeTasks.map((t) => `${t.title}${t.dueDate ? ` (${new Date(t.dueDate).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : " (без даты)"}`).join(", ")
        : "нет задач"}
ВАЖНО: Если пользователь хочет создать задачу — добавь в конец:
TASK_JSON:{"title":"название","dueDate":"ISO_или_null","priority":"medium","repeat":"none"}
Правила: коротко (1-2 предл.), ${ru ? "только русский" : "only English"}, эмодзи, dueDate=null если нет времени.`;

      const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      history.push({ role: "user", content: msg });

      const res = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, systemPrompt }),
      });
      if (!res.ok) throw new Error(`Worker ${res.status}`);
      const data = await res.json();
      const aiResponse = data.content;

      // Парсим задачу
      const match = aiResponse.match(/TASK_JSON:(\{[^}]+\})/);
      let finalText = aiResponse.replace(/TASK_JSON:\{[^}]+\}/, "").trim();

      if (match) {
        try {
          const task = JSON.parse(match[1]);
          if (task.title?.length > 1) {
            let dueDate: string | undefined;
            if (task.dueDate) {
              const d = new Date(task.dueDate);
              if (!isNaN(d.getTime()) && d > new Date()) dueDate = task.dueDate;
            }
            const saved = await addTask({
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
              ? new Date(dueDate).toLocaleString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
              : ru ? "без срока" : "no deadline";
            finalText = `✅ ${ru ? "Задача добавлена" : "Task added"}!\n📌 ${task.title}\n⏰ ${timeStr}\n\n${finalText}`;
          }
        } catch {}
      }

      setMessages((p) => [...p, { role: "assistant", content: finalText, timestamp: Date.now() }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: ru ? "⚠️ Ошибка. Попробуй ещё раз." : "⚠️ Error. Try again.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const height = embedded ? "100%" : "calc(100vh - 120px)";

  return (
    <div style={{ display: "flex", flexDirection: "column", height, maxHeight: height, overflow: "hidden" }}>

      {/* Заголовок */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexShrink: 0 }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Bot size={18} color="#3b82f6" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "white", margin: 0 }}>{name}</p>
            <span style={{ fontSize: "10px", backgroundColor: "rgba(59,130,246,0.2)", color: "#60a5fa", padding: "1px 6px", borderRadius: "8px" }}>AI ⚡</span>
            <button onClick={() => { setNewName(name); setShowNameEdit(true); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>✏️</button>
          </div>
          <p style={{ fontSize: "11px", color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.4)", margin: 0 }}>
            {hasSub === null ? "..." : hasSub ? (ru ? "Подписка ✅" : "Sub ✅") : isLimited ? (ru ? "Лимит" : "Limit") : `${AI_FREE_LIMIT - usage}/${AI_FREE_LIMIT}`}
            {" • "}{MOTIVATION_MODES[motivation.mode].emoji} {ru ? MOTIVATION_MODES[motivation.mode].label : MOTIVATION_MODES[motivation.mode].labelEn}
          </p>
        </div>
        <button onClick={() => setShowMotivation(true)} style={{ width: "34px", height: "34px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Settings size={16} color="rgba(255,255,255,0.5)" />
        </button>
      </div>

      {/* Редактирование имени */}
      {showNameEdit && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { localStorage.setItem(ASSISTANT_NAME_KEY, newName.trim()); setName(newName.trim()); setShowNameEdit(false); } }} placeholder={ru ? "Имя..." : "Name..."} style={{ flex: 1, height: "34px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "10px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit" }} />
            <button onClick={() => { localStorage.setItem(ASSISTANT_NAME_KEY, newName.trim()); setName(newName.trim()); setShowNameEdit(false); }} style={{ height: "34px", paddingLeft: "12px", paddingRight: "12px", borderRadius: "8px", border: "none", backgroundColor: "#3b82f6", color: "white", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>OK</button>
            <button onClick={() => setShowNameEdit(false)} style={{ height: "34px", paddingLeft: "10px", paddingRight: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", color: "rgba(255,255,255,0.5)", fontSize: "12px", cursor: "pointer" }}>✕</button>
          </div>
        </div>
      )}

      {/* Лимит */}
      {isLimited && (
        <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "8px 12px", marginBottom: "8px", flexShrink: 0, textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: "#fca5a5", margin: "0 0 6px 0" }}>{ru ? `Лимит ${AI_FREE_LIMIT} запросов 🤖` : `Limit ${AI_FREE_LIMIT} 🤖`}</p>
          <button onClick={() => (window as any).Telegram?.WebApp?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe")} style={{ height: "30px", paddingLeft: "14px", paddingRight: "14px", borderRadius: "8px", border: "none", backgroundColor: "#3b82f6", color: "white", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
            {ru ? "Оформить подписку" : "Get subscription"}
          </button>
        </div>
      )}

      {/* Быстрые вопросы */}
      {messages.length <= 1 && (
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "8px", paddingBottom: "2px", flexShrink: 0 }}>
          {(ru
            ? ["что у меня сегодня?", "напомни завтра утром", "купить продукты"]
            : ["what today?", "remind tomorrow morning", "buy groceries"]
          ).map((q) => (
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
                <p style={{ fontSize: "14px", color: msg.role === "user" ? "white" : "rgba(255,255,255,0.9)", margin: 0, lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</p>
              </div>
              <button onClick={() => copyMessage(msg.content, i)} style={{ position: "absolute", bottom: "-18px", right: msg.role === "user" ? "0" : "auto", left: msg.role === "assistant" ? "0" : "auto", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px", padding: "2px 4px" }}>
                {copiedId === i ? <><Check size={11} color="#22c55e" /><span style={{ fontSize: "10px", color: "#22c55e" }}>{ru ? "Скопировано" : "Copied"}</span></> : <Copy size={11} color="rgba(255,255,255,0.2)" />}
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "4px", alignItems: "center" }}>
              {[0,1,2].map((i) => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.4)", animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />)}
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginLeft: "4px" }}>{ru ? "Думаю..." : "Thinking..."}</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <button onClick={isListening ? stopListening : startListening} disabled={isLimited} style={{ width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%", backgroundColor: isListening ? "#ef4444" : "rgba(255,255,255,0.08)", border: isListening ? "2px solid #fca5a5" : "none", cursor: isLimited ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: isLimited ? 0.3 : 1 }}>
          {isListening ? <MicOff size={16} color="white" /> : <Mic size={16} color="rgba(255,255,255,0.6)" />}
        </button>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={isListening ? (ru ? "Говори..." : "Speaking...") : isLimited ? (ru ? "Лимит..." : "Limit...") : (ru ? "Напиши задачу или вопрос..." : "Write task or question...")} disabled={isLimited} rows={1} style={{ flex: 1, backgroundColor: isListening ? "rgba(239,68,68,0.1)" : isLimited ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)", border: isListening ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "10px 12px", fontSize: "16px", color: isLimited ? "rgba(255,255,255,0.3)" : "white", outline: "none", resize: "none", maxHeight: "70px", overflowY: "auto", boxSizing: "border-box", fontFamily: "inherit" }} />
        <button onClick={() => sendMessage()} disabled={!input.trim() || loading || isLimited} style={{ width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%", backgroundColor: input.trim() && !loading && !isLimited ? "#3b82f6" : "rgba(255,255,255,0.08)", border: "none", cursor: input.trim() && !loading && !isLimited ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Send size={15} color="white" />
        </button>
      </div>

      {/* Модалка мотивации */}
      {showMotivation && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={(e) => { if (e.target === e.currentTarget) setShowMotivation(false); }}>
          <div style={{ backgroundColor: "#1e293b", borderRadius: "20px", padding: "20px", width: "100%", maxWidth: "340px", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "white", margin: 0 }}>💪 {ru ? "Мотивация" : "Motivation"}</p>
              <button onClick={() => setShowMotivation(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="rgba(255,255,255,0.4)" /></button>
            </div>

            {/* Переключатель */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "12px 14px", marginBottom: "14px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "white", margin: 0 }}>{ru ? "Уведомления" : "Notifications"}</p>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{motivation.enabled ? (ru ? "Включены" : "Enabled") : (ru ? "Выключены" : "Disabled")}</p>
              </div>
              <div onClick={() => setMotivation((p) => ({ ...p, enabled: !p.enabled }))} style={{ position: "relative", width: "44px", height: "24px", borderRadius: "12px", backgroundColor: motivation.enabled ? "#3b82f6" : "rgba(255,255,255,0.15)", cursor: "pointer", transition: "background-color 0.2s" }}>
                <div style={{ position: "absolute", top: "2px", left: motivation.enabled ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.2s" }} />
              </div>
            </div>

            {motivation.enabled && (
              <>
                <p style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>{ru ? "Режим" : "Mode"}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  {(Object.entries(MOTIVATION_MODES) as [MotivationMode, typeof MOTIVATION_MODES[MotivationMode]][]).map(([key, info]) => (
                    <button key={key} onClick={() => setMotivation((p) => ({ ...p, mode: key }))} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "12px", border: motivation.mode === key ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)", backgroundColor: motivation.mode === key ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)", cursor: "pointer", textAlign: "left", width: "100%" }}>
                      <span style={{ fontSize: "22px" }}>{info.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: "14px", fontWeight: 600, color: motivation.mode === key ? "#60a5fa" : "white", margin: 0 }}>{ru ? info.label : info.labelEn}</p>
                        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? info.desc : info.descEn}</p>
                      </div>
                      {motivation.mode === key && <div style={{ width: "18px", height: "18px", borderRadius: "50%", backgroundColor: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={11} color="white" /></div>}
                    </button>
                  ))}
                </div>

                <p style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>{ru ? "Раз в день" : "Per day"}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                  {[1,2,3,4,5].map((n) => (
                    <button key={n} onClick={() => setMotivation((p) => ({ ...p, timesPerDay: n }))} style={{ height: "44px", borderRadius: "12px", border: motivation.timesPerDay === n ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)", backgroundColor: motivation.timesPerDay === n ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.04)", color: motivation.timesPerDay === n ? "#60a5fa" : "rgba(255,255,255,0.6)", fontSize: "16px", fontWeight: motivation.timesPerDay === n ? 700 : 400, cursor: "pointer" }}>{n}×</button>
                  ))}
                </div>

                <div style={{ backgroundColor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: "10px", padding: "10px 12px", marginBottom: "16px" }}>
                  <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>💡 {ru ? "Проверь: /test_motivation боту @aiplannerrubot" : "Test: /test_motivation to @aiplannerrubot"}</p>
                </div>
              </>
            )}

            <button onClick={() => saveMotivation(motivation)} disabled={motivationLoading} style={{ width: "100%", height: "46px", borderRadius: "12px", border: "none", backgroundColor: "#3b82f6", fontSize: "14px", fontWeight: 600, color: "white", cursor: motivationLoading ? "default" : "pointer", opacity: motivationLoading ? 0.7 : 1 }}>
              {motivationLoading ? (ru ? "Запрашиваем доступ..." : "Requesting...") : (ru ? "Сохранить" : "Save")}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce { 0%,100%{transform:translateY(0);opacity:.4} 50%{transform:translateY(-4px);opacity:1} }
        textarea::placeholder { color:rgba(255,255,255,.3); }
      `}</style>
    </div>
  );
}
