import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
} from "react";
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
import { Send, Mic, MicOff, VolumeX, Copy, Check, User } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useNavStore } from "@/lib/navStore";
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

export default function CoachPage({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const addTask = useTaskStore((state) => state.addTask);
  const { theme } = useTheme();
  const ru = language === "ru";
  const userId = getTelegramUserId();
  const goToMoreSettings = useNavStore((s) => s.goToMoreSettings);

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);

  const [profile, setProfile] = useState<UserProfile>({});
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoal[]>([]);

  const isLimited = hasSubscription === false && coachUsage >= COACH_FREE_LIMIT;

  // ─── Загрузка данных ───────────────────────────────────────────────────────
  useEffect(() => {
    checkSubscription(userId).then(setHasSubscription);

    if (userId !== "unknown") {
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
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (chatLoaded && messages.length > 0) saveCoachChatHistory(messages);
  }, [messages, chatLoaded]);

  useEffect(
    () => () => {
      stopSpeaking();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    },
    []
  );

  // Автовысота textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 100) + "px";
  }, [input]);

  // Приветствие при первом открытии
  useEffect(() => {
    if (chatLoaded && messages.length === 0) {
      const welcome: ChatMessage = {
        role: "assistant",
        content: ru
          ? `Привет! 👋 Я твой АИ Коуч.\n\n${
              hasSubscription === false
                ? `⚠️ Осталось ${COACH_FREE_LIMIT - coachUsage} из ${COACH_FREE_LIMIT} бесплатных запросов.\n\n`
                : ""
            }Задай вопрос текстом или голосом 🎤\nЯ помогу с целями, мотивацией и планированием 💪`
          : `Hi! 👋 I'm your AI Coach.\n\n${
              hasSubscription === false
                ? `⚠️ ${COACH_FREE_LIMIT - coachUsage} of ${COACH_FREE_LIMIT} free requests left.\n\n`
                : ""
            }Ask me anything via text or voice 🎤\nI'll help with goals, motivation and planning 💪`,
        timestamp: Date.now(),
      };
      setMessages([welcome]);
    }
  }, [chatLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── TTS ───────────────────────────────────────────────────────────────────
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

  // ─── Голос ─────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      (window as any).Telegram?.WebApp?.showAlert(
        ru
          ? "Голосовой ввод не поддерживается в этом браузере"
          : "Voice input not supported in this browser"
      );
      return;
    }
    stopSpeaking();
    setCoachState("listening");
    setIsListening(true);

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

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
      // Отправляем с небольшой задержкой чтобы state обновился
      setTimeout(() => {
        sendMessageRef.current(transcript);
      }, 100);
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
  }, [ru]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setCoachState("idle");
  }, []);

  // ─── Копирование ───────────────────────────────────────────────────────────
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

  // ─── Отправка ──────────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text?: string) => {
      if (sendingRef.current) return;
      const messageText = (text || input).trim();
      if (!messageText || loading) return;

      if (isLimited) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.showAlert(
          ru
            ? `Лимит ${COACH_FREE_LIMIT} запросов в день 🤖\n\nОформи подписку для безлимитного доступа!`
            : `Daily limit of ${COACH_FREE_LIMIT} requests 🤖\n\nGet subscription for unlimited access!`
        );
        tg?.openTelegramLink(
          "https://t.me/aiplannerrubot?start=subscribe"
        );
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

        const systemPrompt = `Ты персональный АИ Коуч в приложении CortexAI. Ведёшь мотивирующий диалог с пользователем.

Профиль пользователя: ${profileStr || "не заполнен"}
Активные задачи: ${activeTasks.map((t) => t.title).join(", ") || "нет"}
Цели этой недели: ${
          weeklyGoals.length > 0
            ? weeklyGoals
                .map((g) => `${g.text} [${g.completed ? "✅" : "⬜"}]`)
                .join(", ")
            : "нет"
        }

Когда готов создать цели для пользователя — добавь в самый конец ответа:
GOALS_JSON:[{"text":"цель","dueDate":"ISO-дата или null"}]

Правила:
- Отвечай коротко и по делу (2-3 предложения)
- ${ru ? "Только на русском языке" : "Only in English"}
- Используй эмодзи для выразительности
- Задавай уточняющий вопрос если нужно
- dueDate = null если нет конкретной даты`;

        const response = await fetch(AI_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: newMessages
              .slice(-8)
              .map((m) => ({ role: m.role, content: m.content })),
            systemPrompt,
          }),
        });

        if (!response.ok) throw new Error(`Worker error: ${response.status}`);
        const data = await response.json();
        const aiResponse: string = data.content || "⚠️ Нет ответа";

        // Парсим цели — улучшенный regex
        const goalsMatch = aiResponse.match(/GOALS_JSON:\s*(\[[\s\S]*?\])\s*$/);
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

                await addTask({
                  title: `🎯 ${g.text.trim()}`,
                  dueDate: g.dueDate || undefined,
                  priority: "medium",
                  status: "todo",
                  isAiCreated: true,
                  repeat: "none",
                  type: "task",
                  description: ru
                    ? "Цель недели от АИ Коуча"
                    : "Weekly goal from AI Coach",
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
          .replace(/GOALS_JSON:\s*\[[\s\S]*?\]\s*$/, "")
          .trim();

        const finalMsg =
          addedCount > 0
            ? `${cleanResponse}\n\n✅ ${
                ru
                  ? `Добавлено ${addedCount} ${addedCount === 1 ? "цель" : "целей"} в список задач!`
                  : `Added ${addedCount} ${addedCount === 1 ? "goal" : "goals"} to your task list!`
              }`
            : cleanResponse;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: finalMsg, timestamp: Date.now() },
        ]);
        handleCoachSpeak(finalMsg);
      } catch (err) {
        console.error("Coach AI error:", err);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: ru
              ? "⚠️ Ошибка подключения. Проверь интернет и попробуй ещё раз."
              : "⚠️ Connection error. Check internet and try again.",
            timestamp: Date.now(),
          },
        ]);
        setCoachState("idle");
      } finally {
        setLoading(false);
        sendingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      input,
      loading,
      isLimited,
      hasSubscription,
      coachUsage,
      tasks,
      messages,
      addTask,
      profile,
      weeklyGoals,
      userId,
      ru,
      handleCoachSpeak,
    ]
  );

  // Ref для доступа из голосового обработчика (избегаем stale closure)
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const quickPrompts = ru
    ? ["Составь план на неделю", "Оцени мой прогресс", "Советы по продуктивности", "Я в стрессе"]
    : ["Create weekly plan", "Assess my progress", "Productivity tips", "I'm stressed"];

  const outerStyle: CSSProperties = embedded
    ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }
    : {
        display: "flex",
        flexDirection: "column",
        height: "calc(var(--vh, 1vh) * 100 - 120px)",
        maxHeight: "calc(var(--vh, 1vh) * 100 - 120px)",
        overflow: "hidden",
      };

  return (
    <div style={outerStyle}>
      {/* ── Шапка с аватаром ── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: embedded ? "10px" : "8px",
          paddingBottom: "10px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          overflow: "visible",
        }}
      >
        <div
          style={{
            paddingTop: "4px",
            paddingBottom: "2px",
            overflow: "visible",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <CoachAvatar state={coachState} size={68} />
        </div>

        <div
          style={{
            marginTop: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            flexWrap: "wrap",
            width: "100%",
            paddingLeft: "8px",
            paddingRight: "8px",
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 700, color: "white", margin: 0 }}>
            {ru ? "АИ Коуч" : "AI Coach"}
          </p>

          {/* Кнопка профиля */}
          <button
            type="button"
            onClick={() => {
              const tg = (window as any).Telegram?.WebApp;
              tg?.HapticFeedback?.impactOccurred?.("light");
              goToMoreSettings();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              height: "26px",
              paddingLeft: "10px",
              paddingRight: "10px",
              borderRadius: "10px",
              border: `1px solid ${theme.primary}40`,
              backgroundColor: `${theme.primary}18`,
              color: theme.primary,
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <User size={13} />
            {ru ? "Профиль" : "Profile"}
          </button>

          {/* Статус */}
          <span
            style={{
              fontSize: "10px",
              backgroundColor: `${theme.primary}25`,
              color: theme.primary,
              padding: "1px 7px",
              borderRadius: "8px",
            }}
          >
            {coachState === "idle" && "💪"}
            {coachState === "listening" && "🎤"}
            {coachState === "thinking" && "🤔"}
            {coachState === "speaking" && "🗣"}
          </span>

          {/* TTS toggle */}
          {isTTSAvailable() && (
            <button
              onClick={() => {
                if (ttsEnabled) stopSpeaking();
                setTtsEnabled(!ttsEnabled);
              }}
              title={ttsEnabled ? (ru ? "Выключить голос" : "Mute") : (ru ? "Включить голос" : "Unmute")}
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

        {/* Счётчик запросов */}
        <p
          style={{
            fontSize: "10px",
            color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.35)",
            margin: "3px 0 0 0",
          }}
        >
          {hasSubscription === true
            ? (ru ? "Безлимитный доступ ✅" : "Unlimited access ✅")
            : isLimited
            ? (ru ? "Лимит исчерпан" : "Limit reached")
            : ru
            ? `${COACH_FREE_LIMIT - coachUsage} из ${COACH_FREE_LIMIT} запросов сегодня`
            : `${COACH_FREE_LIMIT - coachUsage} of ${COACH_FREE_LIMIT} today`}
        </p>

        {/* Статус текстом */}
        <p
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.3)",
            margin: "1px 0 0 0",
            height: "14px",
          }}
        >
          {coachState === "listening" && (ru ? "Слушаю..." : "Listening...")}
          {coachState === "thinking" && (ru ? "Думаю..." : "Thinking...")}
          {coachState === "speaking" && (ru ? "Говорю..." : "Speaking...")}
        </p>
      </div>

      {/* ── Баннер лимита ── */}
      {isLimited && (
        <div
          style={{
            backgroundColor: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "10px",
            padding: "8px 14px",
            margin: "8px 0 4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          <p style={{ fontSize: "12px", color: "#fca5a5", margin: 0 }}>
            {ru
              ? `Лимит ${COACH_FREE_LIMIT} запросов/день 🤖`
              : `Limit ${COACH_FREE_LIMIT} requests/day 🤖`}
          </p>
          <button
            onClick={() => {
              (window as any).Telegram?.WebApp?.openTelegramLink(
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
          paddingTop: "8px",
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
                    msg.role === "user"
                      ? "18px 18px 4px 18px"
                      : "18px 18px 18px 4px",
                  backgroundColor:
                    msg.role === "user" ? theme.primary : "rgba(255,255,255,0.07)",
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
                      msg.role === "user" ? "white" : "rgba(255,255,255,0.9)",
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
                    animation: `coachBounce 1s ease-in-out ${i * 0.18}s infinite`,
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
            border: isListening
              ? "2px solid #fca5a5"
              : "1px solid rgba(255,255,255,0.1)",
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
              : (ru ? "Напишите коучу..." : "Message your coach...")
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
                ? theme.primary
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
        @keyframes coachBounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-5px); opacity: 1; }
        }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
        textarea:disabled { cursor: not-allowed; }
      `}</style>
    </div>
  );
}
