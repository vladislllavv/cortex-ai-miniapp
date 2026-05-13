import { useState, useEffect, useRef, useCallback } from "react";
import { useI18nStore } from "@/lib/i18n";
import {
  useTaskStore,
  getTelegramUserId,
  checkSubscription,
  saveCoachChatHistory,
  loadCoachChatHistory,
  loadChatFromFirebase,
  ChatMessage,
} from "@/lib/store";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { Send, Mic, MicOff, VolumeX, Copy, Check } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import CoachAvatar, { CoachState } from "@/components/CoachAvatar";

const AI_WORKER_URL = "https://ancient-river-8a20.bubo-buboff.workers.dev";
const COACH_FREE_LIMIT = 2;
const COACH_USAGE_KEY = "cortex-coach-usage";

function getCoachUsage(): number {
  try {
    const stored = localStorage.getItem(COACH_USAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const today = new Date().toISOString().split("T")[0];
      if (parsed.date === today) return parsed.count;
    }
  } catch {}
  return 0;
}

function setCoachUsageStorage(count: number) {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem(COACH_USAGE_KEY, JSON.stringify({ date: today, count }));
}

interface UserProfile {
  weight?: string;
  height?: string;
  age?: string;
  fitnessLevel?: string;
  goals?: string;
}

interface WeeklyGoal {
  id: string;
  text: string;
  completed: boolean;
  weekStart: string;
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

function speakText(
  text: string,
  lang: string,
  onStart: () => void,
  onEnd: () => void
) {
  if (!("speechSynthesis" in window)) {
    onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "ru" ? "ru-RU" : "en-US";
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function isTTSAvailable(): boolean {
  return "speechSynthesis" in window;
}

export default function CoachPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const addTask = useTaskStore((state) => state.addTask);
  const { theme } = useTheme();
  const ru = language === "ru";
  const userId = getTelegramUserId();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [coachUsage, setCoachUsageState] = useState(() => getCoachUsage());
  const [chatLoaded, setChatLoaded] = useState(false);

  const [coachState, setCoachState] = useState<CoachState>("idle");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const [profile, setProfile] = useState<UserProfile>({});
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoal[]>([]);

  const isLimited = hasSubscription === false && coachUsage >= COACH_FREE_LIMIT;

  useEffect(() => {
    checkSubscription(userId).then(setHasSubscription);

    if (userId !== "unknown") {
      // Загрузка профиля и целей
      getDoc(doc(db, "users", userId, "settings", "profile"))
        .then((snap) => {
          if (snap.exists()) setProfile(snap.data() as UserProfile);
        })
        .catch(() => {});

      getDocs(collection(db, "users", userId, "weeklyGoals"))
        .then((snap) => {
          const goals: WeeklyGoal[] = [];
          snap.forEach((d) => goals.push(d.data() as WeeklyGoal));
          setWeeklyGoals(goals.filter((g) => g.weekStart === getWeekStart()));
        })
        .catch(() => {});

      // Загрузка чата из Firebase
      loadChatFromFirebase(userId, "ai-coach").then((firebaseMessages) => {
        if (firebaseMessages.length > 0) {
          setMessages(firebaseMessages as ChatMessage[]);
        } else {
          const local = loadCoachChatHistory();
          if (local.length > 0) setMessages(local as ChatMessage[]);
        }
        setChatLoaded(true);
      });
    } else {
      setChatLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (chatLoaded && messages.length > 0) {
      saveCoachChatHistory(messages);
    }
  }, [messages, chatLoaded]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  // Приветствие при первом открытии
  useEffect(() => {
    if (chatLoaded && messages.length === 0) {
      const welcome: ChatMessage = {
        role: "assistant",
        content: ru
          ? `Привет! 👋 Я твой AI коуч.\n\n${
              hasSubscription === false
                ? `⚠️ Осталось ${COACH_FREE_LIMIT - coachUsage} из ${COACH_FREE_LIMIT} бесплатных запросов.\n\n`
                : ""
            }Задай вопрос текстом или голосом 🎤\nЯ помогу с целями, мотивацией и планированием 💪`
          : `Hi! 👋 I'm your AI coach.\n\n${
              hasSubscription === false
                ? `⚠️ ${COACH_FREE_LIMIT - coachUsage} of ${COACH_FREE_LIMIT} free requests left.\n\n`
                : ""
            }Ask me anything via text or voice 🎤\nI'll help with goals, motivation and planning 💪`,
        timestamp: Date.now(),
      };
      setMessages([welcome]);
    }
  }, [chatLoaded]);

  const handleCoachSpeak = useCallback(
    (text: string) => {
      if (!ttsEnabled || !isTTSAvailable()) {
        setCoachState("idle");
        return;
      }
      const clean = text
        .replace(/GOALS_JSON:\[[\s\S]*?\]/g, "")
        .replace(/✅ Добавлено .+ целей.*$/m, "")
        .replace(/✅ Added .+ goals.*$/m, "")
        .trim();
      if (!clean) {
        setCoachState("idle");
        return;
      }
      setCoachState("speaking");
      speakText(
        clean,
        language,
        () => setCoachState("speaking"),
        () => setCoachState("idle")
      );
    },
    [ttsEnabled, language]
  );

  const startListening = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      (window as any).Telegram?.WebApp?.showAlert(
        ru
          ? "Голосовой ввод не поддерживается"
          : "Voice input not supported"
      );
      return;
    }
    stopSpeaking();
    setCoachState("listening");
    setIsListening(true);

    const r = new SR();
    r.lang = ru ? "ru-RU" : "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
      setCoachState("idle");
      recognitionRef.current = null;
      setTimeout(() => sendMessage(transcript), 100);
    };
    r.onerror = () => {
      setIsListening(false);
      setCoachState("idle");
      recognitionRef.current = null;
    };
    r.onend = () => {
      setIsListening(false);
      setCoachState("idle");
      recognitionRef.current = null;
    };
    recognitionRef.current = r;
    r.start();
  }, [ru]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setCoachState("idle");
  }, []);

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

  const sendMessage = async (text?: string) => {
    if (sendingRef.current) return;
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    if (isLimited) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(
        ru
          ? `Лимит ${COACH_FREE_LIMIT} запросов в день 🤖\n\nОформи подписку!`
          : `Daily limit of ${COACH_FREE_LIMIT} requests 🤖\n\nGet subscription!`
      );
      tg?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
      return;
    }

    sendingRef.current = true;
    const userMsg: ChatMessage = {
      role: "user",
      content: messageText,
      timestamp: Date.now(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setCoachState("thinking");

    if (hasSubscription === false) {
      const nc = coachUsage + 1;
      setCoachUsageState(nc);
      setCoachUsageStorage(nc);
    }

    try {
      const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 5);
      const profileStr = Object.entries(profile)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      const systemPrompt = `Ты персональный AI коуч в приложении CortexAI. Ведёшь диалог с пользователем.

Профиль: ${profileStr || "не заполнен"}
Активные задачи: ${activeTasks.map((t) => t.title).join(", ") || "нет"}
Цели этой недели: ${
        weeklyGoals.length > 0
          ? weeklyGoals
              .map((g) => `${g.text} [${g.completed ? "✅" : "⬜"}]`)
              .join(", ")
          : "нет"
      }

Ты можешь задавать уточняющие вопросы. Когда готов создать цели — добавь в конец:
GOALS_JSON:[{"text":"цель","dueDate":"ISO_или_null"}]

Правила:
- Отвечай коротко (2-3 предложения)
- ${ru ? "Только на русском" : "Only in English"}
- Используй эмодзи
- Задавай 1 вопрос если нужно уточнение
- dueDate = null если нет конкретной даты`;

      const response = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(-8).map((m) => ({
            role: m.role,
            content: m.content,
          })),
          systemPrompt,
        }),
      });

      if (!response.ok) throw new Error(`Worker error: ${response.status}`);
      const data = await response.json();
      const aiResponse = data.content || "⚠️ Нет ответа";

      // Парсим и создаём цели
      const goalsMatch = aiResponse.match(/GOALS_JSON:(\[[\s\S]*?\])/);
      let addedCount = 0;

      if (goalsMatch) {
        try {
          const parsed = JSON.parse(goalsMatch[1]);
          for (const g of parsed) {
            if (g.text && g.text.trim().length > 1) {
              const goalId = `goal_${Date.now()}_${Math.random()
                .toString(36)
                .substr(2, 6)}`;
              const weekStart = getWeekStart();

              // Сохраняем цель
              if (userId !== "unknown") {
                setDoc(
                  doc(db, "users", userId, "weeklyGoals", goalId),
                  {
                    id: goalId,
                    text: g.text.trim(),
                    completed: false,
                    weekStart,
                    createdAt: new Date().toISOString(),
                    category: "ai",
                    dueDate: g.dueDate || null,
                  }
                ).catch(() => {});
              }

              // Создаём задачу через store
              await addTask({
                title: `🎯 ${g.text.trim()}`,
                dueDate: g.dueDate || undefined,
                priority: "medium",
                status: "todo",
                isAiCreated: true,
                repeat: "none",
                type: "task",
                description: ru
                  ? "Цель недели от AI коуча"
                  : "Weekly goal from AI coach",
                items: [],
              });

              addedCount++;
            }
          }
        } catch (e) {
          console.error("Goals parse error:", e);
        }
      }

      const cleanResponse = aiResponse
        .replace(/GOALS_JSON:\[[\s\S]*?\]/, "")
        .trim();

      const finalMsg =
        addedCount > 0
          ? `${cleanResponse}\n\n✅ ${
              ru
                ? `Добавлено ${addedCount} целей в список задач!`
                : `Added ${addedCount} goals to your task list!`
            }`
          : cleanResponse;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: finalMsg, timestamp: Date.now() },
      ]);

      handleCoachSpeak(finalMsg);
    } catch (err) {
      console.error("AI error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ru
            ? "⚠️ Ошибка подключения. Попробуй ещё раз."
            : "⚠️ Connection error. Try again.",
          timestamp: Date.now(),
        },
      ]);
      setCoachState("idle");
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const quickPrompts = ru
    ? [
        "Составь план на неделю",
        "Оцени мой прогресс",
        "Советы по продуктивности",
        "Я в стрессе",
      ]
    : [
        "Create weekly plan",
        "Assess my progress",
        "Productivity tips",
        "I'm stressed",
      ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
        maxHeight: "calc(100vh - 120px)",
        overflow: "hidden",
      }}
    >
      {/* ===== ПЕРСОНАЖ + ЗАГОЛОВОК ===== */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "4px",
          paddingBottom: "10px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <CoachAvatar state={coachState} size={80} />
        <div
          style={{
            marginTop: "6px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "white",
              margin: 0,
            }}
          >
            AI {ru ? "Коуч" : "Coach"}
          </p>
          <span
            style={{
              fontSize: "10px",
              backgroundColor: `${theme.primary}25`,
              color: theme.primary,
              padding: "1px 6px",
              borderRadius: "8px",
            }}
          >
            {coachState === "idle" && "💪"}
            {coachState === "listening" && "🎤"}
            {coachState === "thinking" && "🤔"}
            {coachState === "speaking" && "🗣"}
          </span>

          {/* TTS кнопка */}
          {isTTSAvailable() && (
            <button
              onClick={() => {
                if (ttsEnabled) stopSpeaking();
                setTtsEnabled(!ttsEnabled);
              }}
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: ttsEnabled
                  ? `${theme.primary}15`
                  : "rgba(255,255,255,0.05)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              {ttsEnabled ? (
                <span style={{ fontSize: "12px" }}>🔊</span>
              ) : (
                <VolumeX size={12} color="rgba(255,255,255,0.3)" />
              )}
            </button>
          )}
        </div>

        {/* Лимит / статус */}
        <p
          style={{
            fontSize: "10px",
            color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.35)",
            margin: "2px 0 0 0",
          }}
        >
          {hasSubscription === true
            ? ru ? "Безлимитный доступ ✅" : "Unlimited ✅"
            : isLimited
            ? ru ? "Лимит исчерпан" : "Limit reached"
            : ru
            ? `${COACH_FREE_LIMIT - coachUsage} из ${COACH_FREE_LIMIT} запросов`
            : `${COACH_FREE_LIMIT - coachUsage} of ${COACH_FREE_LIMIT}`}
        </p>

        {/* Статус состояния */}
        <p
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.3)",
            margin: "2px 0 0 0",
            height: "14px",
          }}
        >
          {coachState === "listening" && (ru ? "Слушаю..." : "Listening...")}
          {coachState === "thinking" && (ru ? "Думаю..." : "Thinking...")}
          {coachState === "speaking" && (ru ? "Говорю..." : "Speaking...")}
        </p>
      </div>

      {/* ===== ЛИМИТ ===== */}
      {isLimited && (
        <div
          style={{
            backgroundColor: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "10px",
            padding: "8px 12px",
            margin: "8px 0",
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          <p
            style={{
              fontSize: "12px",
              color: "#fca5a5",
              margin: "0 0 6px 0",
            }}
          >
            {ru
              ? `Лимит ${COACH_FREE_LIMIT} запросов в день 🤖`
              : `Limit ${COACH_FREE_LIMIT} requests/day 🤖`}
          </p>
          <button
            onClick={() => {
              const tg = (window as any).Telegram?.WebApp;
              tg?.openTelegramLink(
                "https://t.me/aiplannerrubot?start=subscribe"
              );
            }}
            style={{
              height: "28px",
              paddingLeft: "14px",
              paddingRight: "14px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: theme.primary,
              color: "white",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {ru ? "Подписка" : "Subscribe"}
          </button>
        </div>
      )}

      {/* ===== БЫСТРЫЕ ВОПРОСЫ ===== */}
      {messages.length <= 1 && !isLimited && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            overflowX: "auto",
            padding: "8px 0 4px",
            flexShrink: 0,
          }}
        >
          {quickPrompts.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              style={{
                whiteSpace: "nowrap",
                backgroundColor: `${theme.primary}12`,
                border: `1px solid ${theme.primary}25`,
                borderRadius: "16px",
                padding: "5px 12px",
                fontSize: "11px",
                color: theme.primary,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* ===== СООБЩЕНИЯ ===== */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch" as any,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          paddingTop: "8px",
          paddingBottom: "4px",
          minHeight: 0,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent:
                msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div style={{ maxWidth: "85%", position: "relative" }}>
              <div
                style={{
                  padding: "9px 13px",
                  borderRadius:
                    msg.role === "user"
                      ? "16px 16px 4px 16px"
                      : "16px 16px 16px 4px",
                  backgroundColor:
                    msg.role === "user"
                      ? theme.primary
                      : "rgba(255,255,255,0.07)",
                  border:
                    msg.role === "assistant"
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "none",
                }}
              >
                <p
                  style={{
                    fontSize: "14px",
                    color:
                      msg.role === "user"
                        ? "white"
                        : "rgba(255,255,255,0.9)",
                    margin: 0,
                    lineHeight: "1.5",
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
                  bottom: "-18px",
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
                    <Check size={11} color="#22c55e" />
                    <span style={{ fontSize: "10px", color: "#22c55e" }}>
                      {ru ? "Скопировано" : "Copied"}
                    </span>
                  </>
                ) : (
                  <Copy size={11} color="rgba(255,255,255,0.2)" />
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
                borderRadius: "16px 16px 16px 4px",
                backgroundColor: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                gap: "4px",
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
                    backgroundColor: "rgba(255,255,255,0.4)",
                    animation: `bounce 1s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
              <span
                style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.4)",
                  marginLeft: "4px",
                }}
              >
                {ru ? "Думаю..." : "Thinking..."}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ===== ПОЛЕ ВВОДА ===== */}
      <div
        style={{
          display: "flex",
          gap: "6px",
          alignItems: "flex-end",
          paddingTop: "10px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        {/* Микрофон */}
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isLimited}
          style={{
            width: "40px",
            height: "40px",
            minWidth: "40px",
            borderRadius: "50%",
            backgroundColor: isListening
              ? "#ef4444"
              : "rgba(255,255,255,0.08)",
            border: isListening ? "2px solid #fca5a5" : "none",
            cursor: isLimited ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            opacity: isLimited ? 0.3 : 1,
          }}
        >
          {isListening ? (
            <MicOff size={16} color="white" />
          ) : (
            <Mic size={16} color="rgba(255,255,255,0.6)" />
          )}
        </button>

        {/* Текстовое поле */}
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
            isListening
              ? ru ? "Говори..." : "Speaking..."
              : isLimited
              ? ru ? "Лимит..." : "Limit..."
              : ru ? "Напиши коучу..." : "Message coach..."
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
              ? "1px solid rgba(239,68,68,0.3)"
              : "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            padding: "10px 12px",
            fontSize: "16px",
            color: isLimited ? "rgba(255,255,255,0.3)" : "white",
            outline: "none",
            resize: "none",
            maxHeight: "70px",
            overflowY: "auto",
            boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />

        {/* Кнопка отправки */}
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading || isLimited}
          style={{
            width: "40px",
            height: "40px",
            minWidth: "40px",
            borderRadius: "50%",
            backgroundColor:
              input.trim() && !loading && !isLimited
                ? theme.primary
                : "rgba(255,255,255,0.08)",
            border: "none",
            cursor:
              input.trim() && !loading && !isLimited ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Send size={15} color="white" />
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
      `}</style>
    </div>
  );
}
