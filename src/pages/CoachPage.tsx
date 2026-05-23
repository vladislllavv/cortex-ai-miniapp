import {
  useState, useEffect, useRef, useCallback, type CSSProperties,
} from "react";
import { useI18nStore } from "@/lib/i18n";
import {
  useTaskStore, getTelegramUserId, checkSubscription,
  saveCoachChatHistory, loadCoachChatHistory, loadChatFromFirebase, ChatMessage,
} from "@/lib/store";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { Send, Mic, MicOff, VolumeX, Copy, Check, User, Brain } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useNavStore } from "@/lib/navStore";
import CoachAvatar, { CoachState } from "@/components/CoachAvatar";

const AI_WORKER_URL    = "https://ancient-river-8a20.bubo-buboff.workers.dev";
const COACH_FREE_LIMIT = 2;
const COACH_USAGE_KEY  = "cortex-coach-usage";

function getUsage() {
  try {
    const s = localStorage.getItem(COACH_USAGE_KEY);
    if (s) { const p = JSON.parse(s); if (p.date === new Date().toISOString().split("T")[0]) return p.count; }
  } catch {}
  return 0;
}
function saveUsage(n: number) {
  localStorage.setItem(COACH_USAGE_KEY, JSON.stringify({ date: new Date().toISOString().split("T")[0], count: n }));
}

interface UserProfile { weight?: string; height?: string; age?: string; fitnessLevel?: string; goals?: string; }
interface WeeklyGoal  { id: string; text: string; completed: boolean; weekStart: string; }

function getWeekStart() {
  const now = new Date(), day = now.getDay();
  const m = new Date(now); m.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  return m.toISOString().split("T")[0];
}
function tts(text: string, lang: string, onStart: () => void, onEnd: () => void) {
  if (!("speechSynthesis" in window)) { onEnd(); return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "ru" ? "ru-RU" : "en-US"; u.rate = 0.95; u.pitch = 1.05;
  u.onstart = onStart; u.onend = onEnd; u.onerror = onEnd;
  window.speechSynthesis.speak(u);
}
const stopTTS = () => "speechSynthesis" in window && window.speechSynthesis.cancel();
const hasTTS  = () => "speechSynthesis" in window;

export default function CoachPage({ embedded = false }: { embedded?: boolean }) {
  const language   = useI18nStore((s) => s.language);
  const tasks      = useTaskStore((s) => s.tasks);
  const addTask    = useTaskStore((s) => s.addTask);
  const { theme }  = useTheme();
  const ru         = language === "ru";
  const userId     = getTelegramUserId();
  const goSettings = useNavStore((s) => s.goToMoreSettings);

  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [hasSub,    setHasSub]    = useState<boolean | null>(null);
  const [usage,     setUsage]     = useState(getUsage);
  const [loaded,    setLoaded]    = useState(false);
  const [state,     setState]     = useState<CoachState>("idle");
  const [ttsOn,     setTtsOn]     = useState(true);
  const [listening, setListening] = useState(false);
  const [copied,    setCopied]    = useState<number | null>(null);
  const [profile,   setProfile]   = useState<UserProfile>({});
  const [goals,     setGoals]     = useState<WeeklyGoal[]>([]);

  const sendingRef = useRef(false);
  const recRef     = useRef<any>(null);
  const endRef     = useRef<HTMLDivElement>(null);
  const taRef      = useRef<HTMLTextAreaElement>(null);
  const sendRef    = useRef<(txt?: string) => Promise<void>>(async () => {});

  const isLimited = hasSub === false && usage >= COACH_FREE_LIMIT;

  useEffect(() => {
    checkSubscription(userId).then(setHasSub);
    if (userId !== "unknown") {
      getDoc(doc(db, "users", userId, "settings", "profile"))
        .then((s) => { if (s.exists()) setProfile(s.data() as UserProfile); }).catch(() => {});
      getDocs(collection(db, "users", userId, "weeklyGoals"))
        .then((s) => { const g: WeeklyGoal[] = []; s.forEach((d) => g.push(d.data() as WeeklyGoal)); setGoals(g.filter((x) => x.weekStart === getWeekStart())); }).catch(() => {});
      loadChatFromFirebase(userId, "ai-coach").then((m) => {
        if (m.length) setMessages(m as ChatMessage[]);
        else { const l = loadCoachChatHistory(); if (l.length) setMessages(l as ChatMessage[]); }
        setLoaded(true);
      });
    } else setLoaded(true);
  }, [userId]); // eslint-disable-line

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (loaded && messages.length) saveCoachChatHistory(messages); }, [messages, loaded]);
  useEffect(() => () => { stopTTS(); recRef.current?.abort(); }, []);
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px";
  }, [input]);

  // Welcome message
  useEffect(() => {
    if (loaded && !messages.length) {
      setMessages([{
        role: "assistant",
        content: ru
          ? `Привет! 👋 Я твой АИ Коуч.\n\n${hasSub === false ? `⚠️ Осталось ${COACH_FREE_LIMIT - usage} из ${COACH_FREE_LIMIT} бесплатных запросов.\n\n` : ""}Задай вопрос голосом 🎤 или текстом.\nПомогу с целями и мотивацией 💪`
          : `Hi! 👋 I'm your AI Coach.\n\n${hasSub === false ? `⚠️ ${COACH_FREE_LIMIT - usage} of ${COACH_FREE_LIMIT} free requests left.\n\n` : ""}Ask me by voice 🎤 or text.\nI'll help with goals & motivation 💪`,
        timestamp: Date.now(),
      }]);
    }
  }, [loaded]); // eslint-disable-line

  const speak = useCallback((text: string) => {
    if (!ttsOn || !hasTTS()) { setState("idle"); return; }
    const clean = text.replace(/GOALS_JSON:\[[\s\S]*?\]/g, "").trim();
    if (!clean) { setState("idle"); return; }
    setState("speaking");
    tts(clean, language, () => setState("speaking"), () => setState("idle"));
  }, [ttsOn, language]);

  const sendMessage = useCallback(async (txt?: string) => {
    if (sendingRef.current) return;
    const msg = (txt || input).trim();
    if (!msg || loading) return;

    if (isLimited) {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.showAlert(ru ? `Лимит ${COACH_FREE_LIMIT}/день 🤖` : `Daily limit ${COACH_FREE_LIMIT} 🤖`);
        tg.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
      } else {
        alert(ru ? "Лимит исчерпан. Оформи подписку." : "Limit reached. Subscribe.");
      }
      return;
    }

    sendingRef.current = true;
    const newMsgs = [...messages, { role: "user" as const, content: msg, timestamp: Date.now() }];
    setMessages(newMsgs); setInput(""); setLoading(true); setState("thinking");

    if (hasSub === false) { const n = usage + 1; setUsage(n); saveUsage(n); }

    try {
      const active = tasks.filter((t) => t.status !== "done").slice(0, 5);
      const profileStr = Object.entries(profile).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ");
      const sys = `Ты персональный АИ Коуч CortexAI.
Профиль: ${profileStr || "не заполнен"}
Задачи: ${active.map((t) => t.title).join(", ") || "нет"}
Цели недели: ${goals.length ? goals.map((g) => `${g.text}[${g.completed ? "✅" : "⬜"}]`).join(", ") : "нет"}
Когда готов создать цели — в конце: GOALS_JSON:[{"text":"цель","dueDate":"ISO или null"}]
Правила: 2-3 предл., ${ru ? "только по-русски" : "only English"}, эмодзи, задай вопрос если нужно.`;

      const res = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMsgs.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          systemPrompt: sys,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { content } = await res.json();

      const gMatch = (content as string).match(/GOALS_JSON:\s*(\[[\s\S]*?\])\s*$/);
      let added = 0;
      if (gMatch) {
        try {
          for (const g of JSON.parse(gMatch[1])) {
            if (g.text?.trim().length > 1) {
              const gid = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
              if (userId !== "unknown") {
                setDoc(doc(db, "users", userId, "weeklyGoals", gid), {
                  id: gid, text: g.text.trim(), completed: false,
                  weekStart: getWeekStart(), createdAt: new Date().toISOString(), dueDate: g.dueDate || null,
                }).catch(() => {});
              }
              await addTask({
                title: `🎯 ${g.text.trim()}`, dueDate: g.dueDate || undefined,
                priority: "medium", status: "todo", isAiCreated: true,
                repeat: "none", type: "task",
                description: ru ? "Цель от АИ Коуча" : "AI Coach goal", items: [],
              });
              added++;
            }
          }
        } catch {}
      }

      const clean = (content as string).replace(/GOALS_JSON:\s*\[[\s\S]*?\]\s*$/, "").trim();
      const final = added > 0
        ? `${clean}\n\n✅ ${ru ? `Добавлено ${added} ${added === 1 ? "цель" : "целей"}!` : `Added ${added} ${added === 1 ? "goal" : "goals"}!`}`
        : clean;

      setMessages((p) => [...p, { role: "assistant", content: final, timestamp: Date.now() }]);
      speak(final);
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: ru ? "⚠️ Ошибка соединения. Попробуй ещё раз." : "⚠️ Connection error. Try again.", timestamp: Date.now() }]);
      setState("idle");
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }, [input, loading, isLimited, hasSub, usage, tasks, messages, addTask, profile, goals, userId, ru, speak]); // eslint-disable-line

  useEffect(() => { sendRef.current = sendMessage; }, [sendMessage]);

  const startMic = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert(ru ? "Голосовой ввод не поддерживается" : "Voice not supported");
      return;
    }
    stopTTS(); setState("listening"); setListening(true);
    if (recRef.current) { recRef.current.abort(); recRef.current = null; }
    const r = new SR();
    r.lang = ru ? "ru-RU" : "en-US"; r.continuous = false; r.interimResults = false;
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setInput(t); setListening(false); setState("idle"); recRef.current = null;
      setTimeout(() => sendRef.current(t), 100);
    };
    r.onerror = () => { setListening(false); setState("idle"); recRef.current = null; };
    r.onend   = () => { setListening(false); setState("idle"); recRef.current = null; };
    recRef.current = r; r.start();
  }, [ru]);

  const stopMic = useCallback(() => {
    recRef.current?.abort(); recRef.current = null; setListening(false); setState("idle");
  }, []);

  const copyMsg = async (text: string, i: number) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const el = document.createElement("textarea");
      el.value = text; document.body.appendChild(el); el.select();
      document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(i); setTimeout(() => setCopied(null), 2000);
  };

  const QUICK = ru
    ? ["План на неделю", "Оцени прогресс", "Советы по продуктивности", "Я устал"]
    : ["Weekly plan", "Assess progress", "Productivity tips", "I'm tired"];

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      width: "100%",
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    }}>
      {/* ── Coach header ── */}
      <div style={{
        flexShrink: 0,
        paddingBottom: 10,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        marginBottom: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}>
        <div style={{ paddingTop: 4, overflow: "visible" }}>
          <CoachAvatar state={state} size={62} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Brain size={13} color={theme.primary} />
            <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{ru ? "АИ Коуч" : "AI Coach"}</p>
          </div>

          <button
            onClick={() => { (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light"); goSettings(); }}
            style={{ display: "flex", alignItems: "center", gap: 4, height: 26, padding: "0 10px", borderRadius: 10, border: `1px solid ${theme.primary}35`, background: `${theme.primary}12`, color: theme.primary, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
          >
            <User size={12} />{ru ? "Профиль" : "Profile"}
          </button>

          <span style={{ fontSize: 10, background: `${theme.primary}20`, color: theme.primary, padding: "2px 8px", borderRadius: 8 }}>
            {state === "idle" && "💪"}
            {state === "listening" && "🎤"}
            {state === "thinking" && "🤔"}
            {state === "speaking" && "🗣"}
          </span>

          {hasTTS() && (
            <button
              onClick={() => { if (ttsOn) stopTTS(); setTtsOn(!ttsOn); }}
              style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)", background: ttsOn ? `${theme.primary}15` : "rgba(255,255,255,0.05)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
            >
              {ttsOn ? <span style={{ fontSize: 12 }}>🔊</span> : <VolumeX size={12} color="rgba(255,255,255,0.3)" />}
            </button>
          )}
        </div>

        <p style={{ fontSize: 10, color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.3)", margin: 0 }}>
          {hasSub === true
            ? (ru ? "Безлимит ✅" : "Unlimited ✅")
            : isLimited
            ? (ru ? "Лимит исчерпан" : "Limit reached")
            : ru ? `${COACH_FREE_LIMIT - usage} из ${COACH_FREE_LIMIT} сегодня` : `${COACH_FREE_LIMIT - usage} of ${COACH_FREE_LIMIT} today`}
        </p>

        {(state === "listening" || state === "thinking" || state === "speaking") && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {state === "listening" && (ru ? "Слушаю..." : "Listening...")}
            {state === "thinking"  && (ru ? "Думаю..."   : "Thinking...")}
            {state === "speaking"  && (ru ? "Говорю..."  : "Speaking...")}
          </p>
        )}
      </div>

      {/* ── Limit banner ── */}
      {isLimited && (
        <div style={{ flexShrink: 0, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "8px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <p style={{ fontSize: 12, color: "#fca5a5", margin: 0 }}>{ru ? `Лимит ${COACH_FREE_LIMIT}/день 🤖` : `Limit ${COACH_FREE_LIMIT}/day 🤖`}</p>
          <button
            onClick={() => {
              const tg = (window as any).Telegram?.WebApp;
              if (tg) tg.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
              else window.open("https://t.me/aiplannerrubot?start=subscribe", "_blank");
            }}
            style={{ height: 28, padding: "0 12px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >{ru ? "Подписка" : "Subscribe"}</button>
        </div>
      )}

      {/* ── Quick chips ── */}
      {messages.length <= 1 && !isLimited && (
        <div style={{ flexShrink: 0, display: "flex", gap: 6, overflowX: "auto", padding: "0 0 10px 0" }}>
          {QUICK.map((q) => (
            <button key={q} onClick={() => sendMessage(q)} style={{
              whiteSpace: "nowrap", background: `${theme.primary}10`,
              border: `1px solid ${theme.primary}22`, borderRadius: 20,
              padding: "6px 14px", fontSize: 11, color: theme.primary,
              cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
            }}>{q}</button>
          ))}
        </div>
      )}

      {/* ── Messages (scrollable) ── */}
      <div style={{
        flex: 1, overflowY: "auto", overflowX: "hidden",
        display: "flex", flexDirection: "column", gap: 12,
        paddingTop: 4, paddingBottom: 8, minHeight: 0,
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
      }}>
        {/* Mic */}
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
          {listening ? <MicOff size={18} color="#fff" /> : <Mic size={18} color="rgba(255,255,255,0.65)" />}
        </button>

        {/* Textarea */}
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={
            listening
              ? (ru ? "🎤 Говорите..." : "🎤 Speaking...")
              : (ru ? "Ответ или вопрос АИ Коучу..." : "Reply or ask the AI Coach...")
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

        {/* Send */}
        <button
          onClick={() => sendMessage()}
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
