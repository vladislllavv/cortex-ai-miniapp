import { useState, useRef, useEffect, useCallback } from "react";
import {
  useTaskStore, checkSubscription, getTelegramUserId, getSafeUserId,
  saveChatHistory, loadChatHistory, loadChatFromFirebase, ChatMessage,
} from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { Send, Mic, MicOff, Copy, Check, Zap, Edit3 } from "lucide-react";

const ASSISTANT_NAME_KEY = "cortex-assistant-name";
const AI_FREE_LIMIT = 5;
const AI_USAGE_KEY  = "cortex-ai-usage";
const AI_WORKER_URL = "https://ancient-river-8a20.bubo-buboff.workers.dev";

function getName()  { return localStorage.getItem(ASSISTANT_NAME_KEY) || "CortexAI"; }
function getUsage() {
  try {
    const s = localStorage.getItem(AI_USAGE_KEY);
    if (s) { const p = JSON.parse(s); if (p.date === new Date().toISOString().split("T")[0]) return p.count; }
  } catch {}
  return 0;
}
function saveUsage(n: number) {
  localStorage.setItem(AI_USAGE_KEY, JSON.stringify({ date: new Date().toISOString().split("T")[0], count: n }));
}

const WELCOME = (ru: boolean, name: string): ChatMessage => ({
  role: "assistant",
  content: ru
    ? `Привет! 👋 Я ${name} — твой АИ Агент.\n\nМогу:\n• Создавать задачи голосом и текстом\n• Напоминать о делах\n• Отвечать на вопросы\n\n💡 Попробуй: "напомни завтра в 10 встреча"`
    : `Hi! 👋 I'm ${name} — your AI Agent.\n\nI can:\n• Create tasks by voice & text\n• Set reminders\n• Answer questions\n\n💡 Try: "remind tomorrow at 10 meeting"`,
  timestamp: Date.now(),
});

export default function AiProcessPage({ embedded = false }: { embedded?: boolean }) {
  const language = useI18nStore((s) => s.language);
  const tasks    = useTaskStore((s) => s.tasks);
  const addTask  = useTaskStore((s) => s.addTask);
  const { theme } = useTheme();
  const ru = language === "ru";

  const [name,      setName]      = useState(getName);
  const [editName,  setEditName]  = useState(false);
  const [newName,   setNewName]   = useState("");
  const [messages,  setMessages]  = useState<ChatMessage[]>(() => {
    const s = loadChatHistory();
    return s.length ? s as ChatMessage[] : [WELCOME(ru, getName())];
  });
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [hasSub,    setHasSub]    = useState<boolean | null>(null);
  const [usage,     setUsage]     = useState(getUsage);
  const [loaded,    setLoaded]    = useState(false);
  const [listening, setListening] = useState(false);
  const [copied,    setCopied]    = useState<number | null>(null);

  const sendingRef = useRef(false);
  const recRef     = useRef<any>(null);
  const endRef     = useRef<HTMLDivElement>(null);
  const taRef      = useRef<HTMLTextAreaElement>(null);
  const userId     = getSafeUserId();

  useEffect(() => {
    checkSubscription(userId).then(setHasSub);
    if (userId) {
      loadChatFromFirebase(userId, "ai-assistant").then((m) => {
        if (m.length) setMessages(m as ChatMessage[]);
        setLoaded(true);
      });
    } else setLoaded(true);
  }, []); // eslint-disable-line

  useEffect(() => { if (hasSub === true) setUsage(0); }, [hasSub]);
  useEffect(() => { if (loaded) saveChatHistory(messages); }, [messages, loaded]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px";
  }, [input]);
  useEffect(() => () => { recRef.current?.abort(); }, []);

  const isLimited = hasSub === false && usage >= AI_FREE_LIMIT;

  const startMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert(ru ? "Голосовой ввод не поддерживается в этом браузере" : "Voice input not supported");
      return;
    }
    if (recRef.current) { recRef.current.abort(); recRef.current = null; }
    const r = new SR();
    r.lang = ru ? "ru-RU" : "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onstart  = () => setListening(true);
    r.onresult = (e: any) => { setInput(e.results[0][0].transcript); setListening(false); recRef.current = null; };
    r.onerror  = () => { setListening(false); recRef.current = null; };
    r.onend    = () => { setListening(false); recRef.current = null; };
    recRef.current = r;
    r.start();
  }, [ru]);

  const stopMic = useCallback(() => {
    recRef.current?.abort(); recRef.current = null; setListening(false);
  }, []);

  const copyMsg = async (text: string, i: number) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const el = document.createElement("textarea");
      el.value = text; document.body.appendChild(el); el.select();
      document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(i); setTimeout(() => setCopied(null), 2000);
  };

  const send = useCallback(async (txt?: string) => {
    if (sendingRef.current) return;
    const msg = (txt || input).trim();
    if (!msg || loading) return;

    if (isLimited) {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.showAlert(ru ? `Лимит ${AI_FREE_LIMIT} запросов/день 🤖` : `Daily limit ${AI_FREE_LIMIT} 🤖`);
        tg.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
      } else {
        alert(ru ? `Лимит ${AI_FREE_LIMIT} запросов/день. Оформи подписку.` : `Limit reached. Subscribe.`);
      }
      return;
    }

    sendingRef.current = true;
    setMessages((p) => [...p, { role: "user", content: msg, timestamp: Date.now() }]);
    setInput("");
    setLoading(true);

    if (hasSub === false) { const n = usage + 1; setUsage(n); saveUsage(n); }

    try {
      const active = tasks.filter((t) => t.status !== "done").slice(0, 8);
      const sys = `Ты АИ Агент CortexAI. Время: ${new Date().toLocaleString("ru-RU")}.
Задачи: ${active.length ? active.map((t) => `${t.title}${t.dueDate ? ` (${new Date(t.dueDate).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}`).join(", ") : "нет"}
Если нужно создать задачу — в конце ответа: TASK_JSON:{"title":"...","dueDate":"ISO или null","priority":"medium","repeat":"none"}
Отвечай коротко, ${ru ? "только по-русски" : "only English"}, с эмодзи.`;

      const hist = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      hist.push({ role: "user", content: msg });

      const res = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: hist, systemPrompt: sys }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { content } = await res.json();

      const match = (content as string).match(/TASK_JSON:\s*(\{[\s\S]*?\})\s*$/);
      let final = (content as string).replace(/TASK_JSON:\s*\{[\s\S]*?\}\s*$/, "").trim();

      if (match) {
        try {
          const td = JSON.parse(match[1]);
          if (td.title?.length > 1) {
            const dd = td.dueDate && td.dueDate !== "null" ? td.dueDate : undefined;
            await addTask({
              title: td.title, dueDate: dd,
              priority: td.priority || "medium", status: "todo",
              isAiCreated: true, repeat: td.repeat || "none",
              type: "task", description: "", items: [],
            });
            const timeStr = dd
              ? new Date(dd).toLocaleString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
              : (ru ? "без срока" : "no deadline");
            final = `✅ ${ru ? "Задача создана" : "Task created"}!\n📌 ${td.title}\n⏰ ${timeStr}\n\n${final}`;
          }
        } catch {}
      }

      setMessages((p) => [...p, { role: "assistant", content: final || content, timestamp: Date.now() }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: ru ? "⚠️ Ошибка соединения. Попробуй ещё раз." : "⚠️ Connection error. Try again.", timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }, [input, loading, isLimited, hasSub, usage, tasks, messages, addTask, ru]); // eslint-disable-line

  const QUICK = ru
    ? ["Что сегодня?", "Напомни завтра в 10", "Купить продукты", "Создай план"]
    : ["What today?", "Remind tomorrow 10am", "Buy groceries", "Create plan"];

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      width: "100%",
      /* Ключевое: занимаем всё доступное пространство родителя */
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: `${theme.primary}20`, border: `1px solid ${theme.primary}30`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Zap size={18} color={theme.primary} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editName ? (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (newName.trim()) { localStorage.setItem(ASSISTANT_NAME_KEY, newName.trim()); setName(newName.trim()); }
                      setEditName(false);
                    }
                  }}
                  style={{ flex: 1, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 10px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
                />
                <button
                  onClick={() => { if (newName.trim()) { localStorage.setItem(ASSISTANT_NAME_KEY, newName.trim()); setName(newName.trim()); } setEditName(false); }}
                  style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >OK</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>{name}</p>
                <span style={{ fontSize: 10, background: `${theme.primary}22`, color: theme.primary, padding: "2px 8px", borderRadius: 8, fontWeight: 600 }}>АИ Агент</span>
                <button onClick={() => { setNewName(name); setEditName(true); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", color: "rgba(255,255,255,0.3)" }}>
                  <Edit3 size={12} />
                </button>
              </div>
            )}
            <p style={{ fontSize: 11, color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.35)", margin: 0 }}>
              {hasSub === null
                ? (ru ? "Проверяем..." : "Checking...")
                : hasSub
                ? (ru ? "Безлимит ✅" : "Unlimited ✅")
                : isLimited
                ? (ru ? "Лимит исчерпан" : "Limit reached")
                : `${AI_FREE_LIMIT - usage}/${AI_FREE_LIMIT} ${ru ? "запросов" : "requests"}`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Limit banner ── */}
      {isLimited && (
        <div style={{ flexShrink: 0, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <p style={{ fontSize: 12, color: "#fca5a5", margin: 0 }}>{ru ? `Лимит ${AI_FREE_LIMIT}/день 🤖` : `Limit ${AI_FREE_LIMIT}/day 🤖`}</p>
          <button
            onClick={() => {
              const tg = (window as any).Telegram?.WebApp;
              if (tg) tg.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
              else window.open("https://t.me/aiplannerrubot?start=subscribe", "_blank");
            }}
            style={{ height: 30, padding: "0 14px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >{ru ? "Подписка" : "Subscribe"}</button>
        </div>
      )}

      {/* ── Quick chips ── */}
      {messages.length <= 1 && !isLimited && (
        <div style={{ flexShrink: 0, display: "flex", gap: 6, overflowX: "auto", marginBottom: 10, paddingBottom: 2 }}>
          {QUICK.map((q) => (
            <button key={q} onClick={() => send(q)} style={{
              whiteSpace: "nowrap", background: `${theme.primary}14`,
              border: `1px solid ${theme.primary}28`, borderRadius: 20,
              padding: "6px 14px", fontSize: 12, color: theme.primary,
              cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
            }}>{q}</button>
          ))}
        </div>
      )}

      {/* ── Messages (scrollable) ── */}
      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        display: "flex", flexDirection: "column", gap: 12,
        paddingBottom: 8, minHeight: 0,
        WebkitOverflowScrolling: "touch" as any,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "83%", position: "relative", paddingBottom: 22 }}>
              <div style={{
                padding: "10px 14px",
                borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: m.role === "user" ? theme.primary : "rgba(255,255,255,0.07)",
                border: m.role === "assistant" ? "1px solid rgba(255,255,255,0.08)" : "none",
                boxShadow: m.role === "user" ? `0 4px 14px ${theme.primary}35` : "none",
              }}>
                <p style={{ fontSize: 14, color: "#fff", margin: 0, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</p>
              </div>
              <button
                onClick={() => copyMsg(m.content, i)}
                style={{ position: "absolute", bottom: 2, right: m.role === "user" ? 0 : "auto", left: m.role === "assistant" ? 0 : "auto", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, padding: "2px 4px" }}
              >
                {copied === i
                  ? <><Check size={10} color="#22c55e" /><span style={{ fontSize: 9, color: "#22c55e" }}>{ru ? "Скопировано" : "Copied"}</span></>
                  : <Copy size={10} color="rgba(255,255,255,0.2)" />}
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 5, alignItems: "center" }}>
              {[0,1,2].map((j) => (
                <div key={j} style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.5)", animation: `dot-bounce 1s ease-in-out ${j * 0.18}s infinite` }} />
              ))}
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>{ru ? "Думаю..." : "Thinking..."}</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Input bar — ВСЕГДА ВИДНО ── */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        paddingTop: 10,
        paddingBottom: 4,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        background: "transparent",
      }}>
        {/* Mic button */}
        <button
          onClick={listening ? stopMic : startMic}
          title={listening ? (ru ? "Остановить" : "Stop") : (ru ? "Голосовой ввод" : "Voice input")}
          style={{
            width: 44, height: 44, minWidth: 44, borderRadius: "50%",
            background: listening ? "#ef4444" : "rgba(255,255,255,0.08)",
            border: listening ? "2px solid #fca5a5" : "1px solid rgba(255,255,255,0.12)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 0.2s",
          }}
        >
          {listening
            ? <MicOff size={18} color="#fff" />
            : <Mic size={18} color="rgba(255,255,255,0.65)" />}
        </button>

        {/* Textarea */}
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            listening
              ? (ru ? "🎤 Говорите..." : "🎤 Speaking...")
              : (ru ? "Напиши задачу или вопрос..." : "Type a task or question...")
          }
          rows={1}
          style={{
            flex: 1,
            background: listening ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.07)",
            border: `1px solid ${listening ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 14,
            padding: "11px 14px",
            fontSize: 15,
            color: "#fff",
            outline: "none",
            resize: "none",
            maxHeight: 120,
            overflowY: "auto",
            fontFamily: "inherit",
            lineHeight: 1.4,
            transition: "border-color 0.2s, background 0.2s",
            display: "block",
            minHeight: 44,
          }}
        />

        {/* Send button */}
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          title={ru ? "Отправить" : "Send"}
          style={{
            width: 44, height: 44, minWidth: 44, borderRadius: "50%",
            background: input.trim() && !loading ? theme.primary : "rgba(255,255,255,0.07)",
            border: "none",
            cursor: input.trim() && !loading ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 0.2s",
            boxShadow: input.trim() && !loading ? `0 4px 14px ${theme.primary}40` : "none",
          }}
        >
          <Send size={17} color="#fff" />
        </button>
      </div>

      <style>{`
        @keyframes dot-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-5px); opacity: 1; }
        }
        textarea::placeholder { color: rgba(255,255,255,0.35) !important; }
      `}</style>
    </div>
  );
}
