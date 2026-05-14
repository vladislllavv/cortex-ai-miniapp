import { useState, useEffect, useRef } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { User, Send, Trash2, ChevronDown } from "lucide-react";
import { useAuthStore } from "@/lib/authStore";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
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

interface CoachPageProps {
  embedded?: boolean;
  onOpenProfile?: () => void;
}

// ─── Анимированный аватар-привидение ───────────────────────────────────────
function CoachAvatar({ size = 90 }: { size?: number }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          inset: -4,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.primary}40 0%, transparent 70%)`,
          animation: "ghost-glow 3s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      {/* Ghost emoji */}
      <div
        style={{
          fontSize: size * 0.72,
          lineHeight: 1,
          animation: "ghost-float 4s ease-in-out infinite",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
        }}
      >
        👻
      </div>
    </div>
  );
}

export default function CoachPage({ embedded, onOpenProfile }: CoachPageProps) {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const { user } = useAuthStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Загрузка имени пользователя
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setUserName(d.displayName || d.name || "");
      }
    });
  }, [user?.uid]);

  // Подписка на сообщения
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "users", user.uid, "coachMessages"),
      orderBy("ts", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Message, "id">),
        }))
      );
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

  const sendMessage = async () => {
    if (!input.trim() || !user?.uid || loading) return;
    const text = input.trim();
    setInput("");
    setLoading(true);

    await addDoc(collection(db, "users", user.uid, "coachMessages"), {
      role: "user",
      text,
      ts: Date.now(),
    });

    try {
      const history = messages.slice(-12).map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const systemPrompt = ru
        ? `Ты персональный AI-коуч по продуктивности и целеполаганию. Зовут пользователя: ${userName || "друг"}. Отвечай по-русски, кратко, мотивирующе, с конкретными советами. Используй эмодзи умеренно.`
        : `You are a personal AI productivity and goal-setting coach. User's name: ${userName || "friend"}. Reply in English, concisely, motivationally, with specific advice. Use emojis moderately.`;

      const reply = await callGemini(text, history, systemPrompt);

      await addDoc(collection(db, "users", user.uid, "coachMessages"), {
        role: "assistant",
        text: reply,
        ts: Date.now() + 1,
      });
    } catch {
      await addDoc(collection(db, "users", user.uid, "coachMessages"), {
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
    const q = query(collection(db, "users", user.uid, "coachMessages"));
    const snap = await import("firebase/firestore").then(({ getDocs }) =>
      getDocs(q)
    );
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "users", user.uid!, "coachMessages", d.id))));
  };

  const greeting = ru
    ? `Привет${userName ? ", " + userName : ""}! 👋 Я твой AI-коуч. Расскажи о своих целях или задай вопрос о продуктивности.`
    : `Hey${userName ? ", " + userName : ""}! 👋 I'm your AI coach. Tell me about your goals or ask about productivity.`;

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
      {/* ── Шапка с аватаром + кнопка Профиль ───────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "8px",
          paddingBottom: "12px",
          flexShrink: 0,
        }}
      >
        {/* Левая часть: аватар + заголовок */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          {/* Аватар с отступом сверху чтобы glow не обрезался */}
          <div style={{ paddingTop: "8px", paddingBottom: "4px" }}>
            <CoachAvatar size={72} />
          </div>
          <div>
            <p
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "white",
                margin: 0,
              }}
            >
              {ru ? "AI Коуч" : "AI Coach"}
            </p>
            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.4)",
                margin: 0,
              }}
            >
              {ru ? "Твой персональный наставник" : "Your personal mentor"}
            </p>
          </div>
        </div>

        {/* Правая часть: кнопки */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Кнопка Профиль */}
          <button
            onClick={onOpenProfile}
            title={ru ? "Профиль" : "Profile"}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <User size={16} color="rgba(255,255,255,0.7)" />
          </button>

          {/* Кнопка очистить */}
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              title={ru ? "Очистить историю" : "Clear history"}
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.08)",
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
      </div>

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
                lineHeight: 1.55,
              }}
            >
              {greeting}
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
          placeholder={ru ? "Напиши коучу..." : "Message your coach..."}
          rows={1}
          style={{
            flex: 1,
            backgroundColor: "rgba(255,255,255,0.07)",
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
          }}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = Math.min(t.scrollHeight, 100) + "px";
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            backgroundColor:
              input.trim() && !loading
                ? theme.primary
                : "rgba(255,255,255,0.1)",
            border: "none",
            cursor: input.trim() && !loading ? "pointer" : "default",
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
