import { useState, useEffect, useRef } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { Send, ChevronDown, Trash2, Lock } from "lucide-react";
import { useAuthStore } from "@/lib/authStore";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import { callGemini } from "@/lib/gemini";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: number;
}

interface AiProcessPageProps {
  embedded?: boolean;
}

const MAX_FREE_MESSAGES = 10;

// Путь к настройкам мотивации (единый!)
const motivationPath = (uid: string) =>
  doc(db, "users", uid, "settings", "motivation");

type MotivationMode = "soft" | "balanced" | "hard";

const MOTIVATION_LABELS: Record<MotivationMode, { ru: string; en: string; emoji: string }> = {
  soft:     { ru: "Мягкий",     en: "Soft",     emoji: "🌱" },
  balanced: { ru: "Баланс",     en: "Balanced", emoji: "⚖️" },
  hard:     { ru: "Жёсткий",   en: "Hard",     emoji: "💪" },
};

function getSystemPrompt(mode: MotivationMode, ru: boolean, userName: string): string {
  const name = userName ? `, ${userName}` : "";
  if (ru) {
    const base = `Ты мощный AI-ассистент по продуктивности${name}. Помогай планировать задачи, управлять временем и достигать целей.`;
    if (mode === "soft")
      return `${base} Общайся мягко, поддерживающе, с заботой. Хвали за любые успехи.`;
    if (mode === "hard")
      return `${base} Будь прямым и требовательным. Не давай оправданий, фокусируй на результате.`;
    return `${base} Держи баланс между поддержкой и требовательностью.`;
  } else {
    const base = `You are a powerful AI productivity assistant${name}. Help with task planning, time management and goal achievement.`;
    if (mode === "soft")
      return `${base} Be gentle, supportive and caring. Praise any progress.`;
    if (mode === "hard")
      return `${base} Be direct and demanding. No excuses, focus on results.`;
    return `${base} Balance support with accountability.`;
  }
}

export default function AiProcessPage({ embedded }: AiProcessPageProps) {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [msgCount, setMsgCount] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [motivationMode, setMotivationMode] = useState<MotivationMode>("balanced");
  const [userName, setUserName] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Загрузка данных пользователя
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setIsPro(!!d.isPro);
        setUserName(d.displayName || d.name || "");
      }
    });
  }, [user?.uid]);

  // Загрузка настроек мотивации (единый путь)
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(motivationPath(user.uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.mode) setMotivationMode(d.mode as MotivationMode);
      }
    });
  }, [user?.uid]);

  // Подписка на сообщения
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "users", user.uid, "aiMessages"),
      orderBy("ts", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Message, "id">),
      }));
      setMessages(msgs);
      setMsgCount(msgs.filter((m) => m.role === "user").length);
    });
    return unsub;
  }, [user?.uid]);

  // Автоскролл
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const canSend = isPro || msgCount < MAX_FREE_MESSAGES;
  const mLabel = MOTIVATION_LABELS[motivationMode];

  const sendMessage = async () => {
    if (!input.trim() || !user?.uid || loading || !canSend) return;
    const text = input.trim();
    setInput("");
    setLoading(true);

    await addDoc(collection(db, "users", user.uid, "aiMessages"), {
      role: "user",
      text,
      ts: Date.now(),
    });

    try {
      const history = messages.slice(-14).map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const systemPrompt = getSystemPrompt(motivationMode, ru, userName);
      const reply = await callGemini(text, history, systemPrompt);

      await addDoc(collection(db, "users", user.uid, "aiMessages"), {
        role: "assistant",
        text: reply,
        ts: Date.now() + 1,
      });
    } catch {
      await addDoc(collection(db, "users", user.uid, "aiMessages"), {
        role: "assistant",
        text: ru
          ? "Произошла ошибка. Попробуй ещё раз."
          : "An error occurred. Please try again.",
        ts: Date.now() + 1,
      });
    } finally {
      setLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!user?.uid) return;
    const { getDocs } = await import("firebase/firestore");
    const snap = await getDocs(
      collection(db, "users", user.uid, "aiMessages")
    );
    await Promise.all(
      snap.docs.map((d) =>
        deleteDoc(doc(db, "users", user.uid!, "aiMessages", d.id))
      )
    );
  };

  const DEFAULT_MESSAGE = ru
    ? `Привет${userName ? ", " + userName : ""}! ⚡ Я твой AI-ассистент.\n\nМогу помочь:\n• 📋 Планировать задачи и день\n• ⏰ Управлять временем\n• 🎯 Ставить и достигать цели\n• 💡 Давать советы по продуктивности\n\nРежим мотивации: ${mLabel.emoji} ${ru ? mLabel.ru : mLabel.en}\nНастрой мотивацию в Ещё → Настройки`
    : `Hey${userName ? ", " + userName : ""}! ⚡ I'm your AI assistant.\n\nI can help:\n• 📋 Plan tasks and your day\n• ⏰ Manage your time\n• 🎯 Set and achieve goals\n• 💡 Give productivity tips\n\nMotivation mode: ${mLabel.emoji} ${mLabel.en}\nCustomize motivation in More → Settings`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        paddingBottom: "68px",
      }}
    >
      {/* ── Шапка ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "10px",
          flexShrink: 0,
        }}
      >
        <div>
          <p
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "white",
              margin: 0,
            }}
          >
            {ru ? "AI Ассистент" : "AI Assistant"}
          </p>
          {/* Режим мотивации — только информационно, без кнопки настройки */}
          <p
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.35)",
              margin: "2px 0 0",
            }}
          >
            {mLabel.emoji} {ru ? mLabel.ru : mLabel.en}
            {!isPro && (
              <span style={{ marginLeft: "8px" }}>
                · {MAX_FREE_MESSAGES - msgCount > 0
                  ? `${MAX_FREE_MESSAGES - msgCount} ${ru ? "сообщ." : "msg left"}`
                  : ru ? "Лимит" : "Limit"}
              </span>
            )}
          </p>
        </div>

        {/* Кнопка очистить (без шестерёнки!) */}
        {messages.length > 0 && (
          <button
            onClick={clearHistory}
            title={ru ? "Очистить историю" : "Clear history"}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor: "rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Trash2 size={15} color="rgba(255,255,255,0.5)" />
          </button>
        )}
      </div>

      {/* ── Лимит исчерпан ────────────────────────────────────────── */}
      {!canSend && (
        <div
          style={{
            backgroundColor: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: "12px",
            padding: "12px 14px",
            marginBottom: "10px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          <Lock size={16} color="#ef4444" />
          <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>
            {ru
              ? "Бесплатный лимит исчерпан. Перейди на Pro для продолжения."
              : "Free limit reached. Upgrade to Pro to continue."}
          </p>
        </div>
      )}

      {/* ── Область сообщений ─────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          paddingRight: "2px",
          minHeight: 0,
        }}
      >
        {/* Приветствие */}
        {messages.length === 0 && (
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              borderRadius: "14px",
              padding: "14px 16px",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <p
              style={{
                fontSize: "14px",
                color: "rgba(255,255,255,0.7)",
                margin: 0,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {DEFAULT_MESSAGE}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "82%",
                padding: "10px 13px",
                borderRadius:
                  msg.role === "user"
                    ? "14px 14px 3px 14px"
                    : "14px 14px 14px 3px",
                backgroundColor:
                  msg.role === "user"
                    ? theme.primary
                    : "rgba(255,255,255,0.08)",
                border:
                  msg.role === "assistant"
                    ? "1px solid rgba(255,255,255,0.07)"
                    : "none",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  color: "white",
                  margin: 0,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.text}
              </p>
            </div>
          </div>
        ))}

        {/* Индикатор загрузки */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "14px 14px 14px 3px",
                backgroundColor: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.07)",
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
                    backgroundColor: theme.primary,
                    animation: `bounce 1.2s ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Кнопка скролла вниз */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          style={{
            position: "absolute",
            bottom: "80px",
            right: "20px",
            width: "34px",
            height: "34px",
            borderRadius: "50%",
            backgroundColor: theme.primary,
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            zIndex: 10,
          }}
        >
          <ChevronDown size={18} color="white" />
        </button>
      )}

      {/* ── Поле ввода ───────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "10px",
          display: "flex",
          gap: "8px",
          alignItems: "flex-end",
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder={
            canSend
              ? ru ? "Напиши ассистенту..." : "Message assistant..."
              : ru ? "Лимит исчерпан" : "Limit reached"
          }
          disabled={!canSend}
          rows={1}
          style={{
            flex: 1,
            backgroundColor: canSend
              ? "rgba(255,255,255,0.07)"
              : "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            padding: "10px 13px",
            color: "white",
            fontSize: "14px",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.4,
            maxHeight: "100px",
            overflowY: "auto",
            opacity: canSend ? 1 : 0.5,
          }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 100) + "px";
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading || !canSend}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            backgroundColor:
              input.trim() && !loading && canSend
                ? theme.primary
                : "rgba(255,255,255,0.1)",
            border: "none",
            cursor:
              input.trim() && !loading && canSend ? "pointer" : "default",
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
    </div>
  );
}
