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
import {
  Send, Bot, Mic, MicOff, Copy, Check, Settings, X,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  addDoc, collection, Timestamp, doc, setDoc, getDoc,
} from "firebase/firestore";

const ASSISTANT_NAME_KEY = "cortex-assistant-name";
const AI_FREE_LIMIT = 5;
const AI_USAGE_KEY = "cortex-ai-usage";
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

function setAiUsageStorage(count: number) {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem(AI_USAGE_KEY, JSON.stringify({ date: today, count }));
}

type MotivationMode = "off" | "soft" | "normal" | "hard";

interface MotivationSettings {
  mode: MotivationMode;
  timesPerDay: number;
  enabled: boolean;
}

const MOTIVATION_MODES: Record<
  MotivationMode,
  {
    label: string;
    labelEn: string;
    description: string;
    descriptionEn: string;
    emoji: string;
  }
> = {
  off: {
    label: "Выключено", labelEn: "Off",
    description: "Уведомления не приходят", descriptionEn: "No notifications",
    emoji: "🔕",
  },
  soft: {
    label: "Мягкий", labelEn: "Soft",
    description: "Добрые и поддерживающие слова", descriptionEn: "Kind and supportive words",
    emoji: "🌸",
  },
  normal: {
    label: "Обычный", labelEn: "Normal",
    description: "Сбалансированная мотивация", descriptionEn: "Balanced motivation",
    emoji: "⚡",
  },
  hard: {
    label: "Жёсткий", labelEn: "Hard",
    description: "Прямо и требовательно, без нецензурщины",
    descriptionEn: "Direct and demanding, no profanity",
    emoji: "🔥",
  },
};

async function loadMotivationSettings(
  userId: string
): Promise<MotivationSettings> {
  const defaults: MotivationSettings = {
    mode: "normal",
    timesPerDay: 3,
    enabled: false,
  };
  if (userId === "unknown") return defaults;
  try {
    const snap = await getDoc(
      doc(db, "users", userId, "settings", "motivation")
    );
    if (snap.exists())
      return { ...defaults, ...(snap.data() as MotivationSettings) };
  } catch {}
  return defaults;
}

async function saveMotivationSettingsToDb(
  userId: string,
  settings: MotivationSettings
) {
  if (userId === "unknown") return;
  try {
    await setDoc(
      doc(db, "users", userId, "settings", "motivation"),
      settings
    );
  } catch (e) {
    console.error("Save motivation settings error:", e);
  }
}

// ✅ Также сохраняем пользователя в users/{userId} чтобы бот знал о нём
async function registerUserInFirebase(userId: string) {
  if (userId === "unknown") return;
  try {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    await setDoc(
      doc(db, "users", userId),
      {
        userId,
        chatId: userId,
        firstName: user?.first_name || "",
        username: user?.username || "",
        lastSeen: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {}
}

function parseTaskFromResponse(response: string): {
  text: string;
  task: {
    title: string;
    dueDate?: string;
    priority: string;
    repeat: string;
  } | null;
} {
  const match = response.match(/TASK_JSON:(\{[^}]+\})/);
  if (match) {
    try {
      const task = JSON.parse(match[1]);
      const text = response.replace(/TASK_JSON:\{[^}]+\}/, "").trim();
      return { text, task };
    } catch {}
  }
  return { text: response, task: null };
}

const DEFAULT_MESSAGE = (ru: boolean, name: string): ChatMessage => ({
  role: "assistant",
  content: ru
    ? `Привет! 👋 Я ${name}, твой AI ассистент.\n\nМогу помочь:\n• "напомни завтра в 10 встреча" → задача в список\n• "купить молоко" → задача без даты\n• "что у меня сегодня?" → план дня\n• 🎤 Голосовой ввод\n\n⚙️ Нажми на шестерёнку для настройки мотивации`
    : `Hi! 👋 I'm ${name}, your AI assistant.\n\nI can help:\n• "remind tomorrow at 10 meeting" → task in list\n• "buy milk" → task without date\n• "what today?" → day plan\n• 🎤 Voice input\n\n⚙️ Tap gear to set up motivation`,
  timestamp: Date.now(),
});

export default function AiProcessPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const addTask = useTaskStore((state) => state.addTask);
  const ru = language === "ru";

  const [assistantName, setAssistantName] = useState(getAssistantName());
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [showMotivationSettings, setShowMotivationSettings] = useState(false);
  const [newName, setNewName] = useState("");

  const [motivationSettings, setMotivationSettings] =
    useState<MotivationSettings>({
      mode: "normal",
      timesPerDay: 3,
      enabled: false,
    });
  const [motivationLoading, setMotivationLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadChatHistory();
    if (saved.length > 0) return saved as ChatMessage[];
    return [DEFAULT_MESSAGE(ru, getAssistantName())];
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [aiUsageCount, setAiUsageCount] = useState(() => getAiUsage());
  const [chatLoaded, setChatLoaded] = useState(false);

  const sendingRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userId = getTelegramUserId();

  // ✅ Загрузка при старте: подписка + мотивация + история чата из Firebase
  useEffect(() => {
    checkSubscription(userId).then(setHasSubscription);
    loadMotivationSettings(userId).then(setMotivationSettings);
    registerUserInFirebase(userId);

    // Загружаем историю из Firebase (приоритет над localStorage)
    if (userId !== "unknown") {
      loadChatFromFirebase(userId, "ai-assistant").then((firebaseMessages) => {
        if (firebaseMessages.length > 0) {
          setMessages(firebaseMessages as ChatMessage[]);
          // Синхронизируем localStorage
          try {
            localStorage.setItem(
              "cortex-ai-chat",
              JSON.stringify(firebaseMessages)
            );
          } catch {}
        }
        setChatLoaded(true);
      });
    } else {
      setChatLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (hasSubscription === true) setAiUsageCount(0);
  }, [hasSubscription]);

  // ✅ Сохраняем историю при каждом изменении (localStorage + Firebase)
  useEffect(() => {
    if (chatLoaded) {
      saveChatHistory(messages);
    }
  }, [messages, chatLoaded]);

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
    const h = () => {
      if (document.hidden && recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setIsListening(false);
      }
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  // ✅ ГЛАВНОЕ ИСПРАВЛЕНИЕ: requestWriteAccess при включении мотивации
  const handleSaveMotivationSettings = async (
    newSettings: MotivationSettings
  ) => {
    const tg = (window as any).Telegram?.WebApp;

    // Если включаем мотивацию — сначала запрашиваем разрешение
    if (newSettings.enabled && newSettings.mode !== "off") {
      if (!tg) {
        // Нет Telegram — просто сохраняем
        await doSaveMotivation(newSettings);
        return;
      }

      setMotivationLoading(true);

      tg.requestWriteAccess(async (granted: boolean) => {
        if (granted) {
          await doSaveMotivation(newSettings);
          tg.showAlert(
            ru
              ? "✅ Мотивация включена!\n\nБот будет присылать сообщения по расписанию."
              : "✅ Motivation enabled!\n\nBot will send messages on schedule."
          );
        } else {
          setMotivationLoading(false);
          tg.showAlert(
            ru
              ? "❌ Доступ отклонён.\n\nБот не сможет присылать уведомления без разрешения."
              : "❌ Access denied.\n\nBot cannot send notifications without permission."
          );
        }
      });
    } else {
      // Выключаем — разрешение не нужно
      await doSaveMotivation(newSettings);
    }
  };

  async function doSaveMotivation(newSettings: MotivationSettings) {
    setMotivationLoading(true);
    setMotivationSettings(newSettings);
    await saveMotivationSettingsToDb(userId, newSettings);
    setMotivationLoading(false);
    setShowMotivationSettings(false);

    const modeInfo = MOTIVATION_MODES[newSettings.mode];

    if (newSettings.mode === "off" || !newSettings.enabled) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ru
            ? "🔕 Мотивационные уведомления отключены."
            : "🔕 Motivation notifications disabled.",
          timestamp: Date.now(),
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ru
            ? `${modeInfo.emoji} Мотивация настроена!\n\nРежим: ${modeInfo.label}\nУведомлений в день: ${newSettings.timesPerDay}\n\nБот будет присылать мотивационные сообщения учитывая твои задачи 💪`
            : `${modeInfo.emoji} Motivation configured!\n\nMode: ${modeInfo.labelEn}\nPer day: ${newSettings.timesPerDay}\n\nBot will send motivational messages based on your tasks 💪`,
          timestamp: Date.now(),
        },
      ]);
    }
  }

  const startListening = () => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      (window as any).Telegram?.WebApp?.showAlert(
        ru ? "Голосовой ввод не поддерживается" : "Voice not supported"
      );
      return;
    }
    const r = new SR();
    r.lang = ru ? "ru-RU" : "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => setIsListening(true);
    r.onresult = (e: any) => {
      setInput(e.results[0][0].transcript);
      setIsListening(false);
    };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    recognitionRef.current = r;
    r.start();
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
    ? [
        "что у меня сегодня?",
        "напомни завтра утром",
        "я в стрессе",
        "купить продукты",
      ]
    : [
        "what do I have today?",
        "remind tomorrow morning",
        "I'm stressed",
        "buy groceries",
      ];

  const sendMessage = async (text?: string) => {
    if (sendingRef.current) return;
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    if (hasSubscription === false && aiUsageCount >= AI_FREE_LIMIT) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(
        ru
          ? `Лимит ${AI_FREE_LIMIT} запросов 🤖\n\nОформи подписку.`
          : `Daily limit reached.\n\nGet subscription.`
      );
      tg?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
      return;
    }

    if (userId === "unknown") {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ru
            ? "⚠️ Открой приложение через бота."
            : "⚠️ Open via bot.",
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    sendingRef.current = true;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: messageText, timestamp: Date.now() },
    ]);
    setInput("");
    setLoading(true);

    if (hasSubscription === false) {
      const nc = aiUsageCount + 1;
      setAiUsageCount(nc);
      setAiUsageStorage(nc);
    }

    try {
      const now = new Date();
      const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 8);

      const systemPrompt = `Ты AI ассистент планировщика CortexAI. Время: ${now.toLocaleString("ru-RU")}.

Активные задачи: ${
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

ВАЖНО: Если пользователь хочет создать задачу — ВСЕГДА добавь в конец:
TASK_JSON:{"title":"название","dueDate":"ISO_дата_или_null","priority":"medium","repeat":"none"}

Правила:
- Отвечай коротко (1-2 предложения)
- ${ru ? "Только на русском" : "Only in English"}
- Используй эмодзи
- dueDate = null если нет времени (задача попадёт в "Без срока")
- Не создавай задачи с датой в прошлом`;

      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      history.push({ role: "user", content: messageText });

      const response = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, systemPrompt }),
      });

      if (!response.ok) throw new Error(`Worker error: ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const aiResponse = data.content;
      const { text, task } = parseTaskFromResponse(aiResponse);

      if (task && task.title && task.title.length > 1) {
        try {
          let validDueDate: string | undefined = undefined;
          if (task.dueDate) {
            const d = new Date(task.dueDate);
            if (!isNaN(d.getTime()) && d > new Date())
              validDueDate = task.dueDate;
          }

          const savedTask = await addTask({
            title: task.title,
            dueDate: validDueDate,
            priority: (task.priority || "medium") as any,
            status: "todo",
            isAiCreated: true,
            repeat: (task.repeat || "none") as any,
            type: "task",
            description: "",
            items: [],
          });

          if (validDueDate && userId !== "unknown") {
            const dueDate = new Date(validDueDate);
            addDoc(collection(db, "tasks"), {
              userId,
              taskId: savedTask.id,
              title: task.title,
              description: "",
              dueDate: validDueDate,
              priority: task.priority || "medium",
              status: "todo",
              createdAt: new Date().toISOString(),
              isSent: false,
              reminderAt: Timestamp.fromDate(dueDate),
              repeat: task.repeat || "none",
              type: "task",
            }).catch(console.error);
          }

          const timeStr = validDueDate
            ? new Date(validDueDate).toLocaleString(
                ru ? "ru-RU" : "en-US",
                {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }
              )
            : ru ? "без срока" : "no deadline";

          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: ru
                ? `✅ Задача добавлена!\n\n📌 ${task.title}\n⏰ ${timeStr}\n\n${text}`
                : `✅ Task added!\n\n📌 ${task.title}\n⏰ ${timeStr}\n\n${text}`,
              timestamp: Date.now(),
            },
          ]);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                text +
                (ru
                  ? "\n\n⚠️ Задача не сохранилась."
                  : "\n\n⚠️ Task not saved."),
              timestamp: Date.now(),
            },
          ]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: text, timestamp: Date.now() },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ru
            ? "⚠️ Ошибка. Попробуй ещё раз."
            : "⚠️ Error. Try again.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  };

  const isLimited = hasSubscription === false && aiUsageCount >= AI_FREE_LIMIT;
  const currentMode = MOTIVATION_MODES[motivationSettings.mode];

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
      {/* ===== ЗАГОЛОВОК ===== */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "10px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            backgroundColor: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Bot size={18} color="#3b82f6" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <p
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "white",
                margin: 0,
              }}
            >
              {assistantName}
            </p>
            <span
              style={{
                fontSize: "10px",
                backgroundColor: "rgba(59,130,246,0.2)",
                color: "#60a5fa",
                padding: "1px 6px",
                borderRadius: "8px",
              }}
            >
              AI ⚡
            </span>
            <button
              onClick={() => {
                setNewName(assistantName);
                setShowNameEdit(true);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px",
                fontSize: "12px",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              ✏️
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <p
              style={{
                fontSize: "11px",
                color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.4)",
                margin: 0,
              }}
            >
              {hasSubscription === null
                ? "..."
                : hasSubscription
                ? ru ? "Подписка ✅" : "Sub ✅"
                : isLimited
                ? ru ? "Лимит" : "Limit"
                : `${AI_FREE_LIMIT - aiUsageCount}/${AI_FREE_LIMIT}`}
            </p>
            <span
              style={{
                fontSize: "11px",
                color:
                  motivationSettings.mode === "off" ||
                  !motivationSettings.enabled
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(255,255,255,0.5)",
              }}
            >
              • {currentMode.emoji} {ru ? currentMode.label : currentMode.labelEn}
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowMotivationSettings(true)}
          style={{
            width: "34px",
            height: "34px",
            borderRadius: "10px",
            backgroundColor: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Settings size={16} color="rgba(255,255,255,0.5)" />
        </button>
      </div>

      {/* ===== РЕДАКТИРОВАНИЕ ИМЕНИ ===== */}
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
          <p
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.4)",
              margin: "0 0 6px 0",
            }}
          >
            {ru ? "Имя ассистента" : "Name"}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              placeholder={ru ? "Имя..." : "Name..."}
              style={{
                flex: 1,
                height: "34px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.07)",
                paddingLeft: "10px",
                paddingRight: "10px",
                fontSize: "14px",
                color: "white",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={saveName}
              style={{
                height: "34px",
                paddingLeft: "12px",
                paddingRight: "12px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#3b82f6",
                color: "white",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              OK
            </button>
            <button
              onClick={() => setShowNameEdit(false)}
              style={{
                height: "34px",
                paddingLeft: "10px",
                paddingRight: "10px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "transparent",
                color: "rgba(255,255,255,0.5)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ===== ЛИМИТ ===== */}
      {isLimited && (
        <div
          style={{
            backgroundColor: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "10px",
            padding: "8px 12px",
            marginBottom: "8px",
            flexShrink: 0,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "12px",
              color: "#fca5a5",
              margin: "0 0 6px 0",
            }}
          >
            {ru ? `Лимит ${AI_FREE_LIMIT} запросов 🤖` : `Limit ${AI_FREE_LIMIT} 🤖`}
          </p>
          <button
            onClick={() => {
              const tg = (window as any).Telegram?.WebApp;
              tg?.openTelegramLink(
                "https://t.me/aiplannerrubot?start=subscribe"
              );
            }}
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
            }}
          >
            {ru ? "Оформить подписку" : "Get subscription"}
          </button>
        </div>
      )}

      {/* ===== БЫСТРЫЕ ВОПРОСЫ ===== */}
      {messages.length <= 1 && (
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
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              style={{
                whiteSpace: "nowrap",
                backgroundColor: "rgba(59,130,246,0.12)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: "16px",
                padding: "5px 10px",
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
          paddingBottom: "4px",
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
                      ? "#3b82f6"
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
                      msg.role === "user" ? "white" : "rgba(255,255,255,0.9)",
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
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
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
          paddingTop: "16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
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
              : ru
              ? "Напиши задачу или вопрос..."
              : "Write task or question..."
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
                ? "#3b82f6"
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

      {/* ===== МОДАЛКА НАСТРОЕК МОТИВАЦИИ ===== */}
      {showMotivationSettings && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMotivationSettings(false);
          }}
        >
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: "20px",
              padding: "20px",
              width: "100%",
              maxWidth: "340px",
              border: "1px solid rgba(255,255,255,0.08)",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "white",
                  margin: 0,
                }}
              >
                💪 {ru ? "Настройки мотивации" : "Motivation Settings"}
              </p>
              <button
                onClick={() => setShowMotivationSettings(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <X size={18} color="rgba(255,255,255,0.4)" />
              </button>
            </div>

            <p
              style={{
                fontSize: "12px",
                color: "rgba(255,255,255,0.4)",
                margin: "0 0 16px 0",
              }}
            >
              {ru
                ? "Бот будет присылать мотивационные уведомления с учётом твоих задач несколько раз в день."
                : "Bot will send motivational notifications based on your tasks several times a day."}
            </p>

            {/* Включить/выключить */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "rgba(255,255,255,0.05)",
                borderRadius: "12px",
                padding: "12px 14px",
                marginBottom: "14px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "white",
                    margin: 0,
                  }}
                >
                  {ru
                    ? "Мотивационные уведомления"
                    : "Motivation notifications"}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.4)",
                    margin: 0,
                  }}
                >
                  {motivationSettings.enabled
                    ? ru ? "Включены" : "Enabled"
                    : ru ? "Выключены" : "Disabled"}
                </p>
              </div>
              <div
                onClick={() =>
                  setMotivationSettings((prev) => ({
                    ...prev,
                    enabled: !prev.enabled,
                  }))
                }
                style={{
                  position: "relative",
                  width: "44px",
                  minWidth: "44px",
                  height: "24px",
                  borderRadius: "12px",
                  backgroundColor: motivationSettings.enabled
                    ? "#3b82f6"
                    : "rgba(255,255,255,0.15)",
                  cursor: "pointer",
                  transition: "background-color 0.2s ease",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: motivationSettings.enabled ? "22px" : "2px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    backgroundColor: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    transition: "left 0.2s ease",
                  }}
                />
              </div>
            </div>

            {motivationSettings.enabled && (
              <>
                {/* Режим */}
                <p
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.4)",
                    margin: "0 0 8px 0",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {ru ? "Режим" : "Mode"}
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginBottom: "16px",
                  }}
                >
                  {(
                    Object.entries(MOTIVATION_MODES) as [
                      MotivationMode,
                      (typeof MOTIVATION_MODES)[MotivationMode]
                    ][]
                  ).map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() =>
                        setMotivationSettings((prev) => ({
                          ...prev,
                          mode: key,
                        }))
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 14px",
                        borderRadius: "12px",
                        border:
                          motivationSettings.mode === key
                            ? "1px solid #3b82f6"
                            : "1px solid rgba(255,255,255,0.08)",
                        backgroundColor:
                          motivationSettings.mode === key
                            ? "rgba(59,130,246,0.15)"
                            : "rgba(255,255,255,0.04)",
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                      }}
                    >
                      <span style={{ fontSize: "22px" }}>{info.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <p
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color:
                              motivationSettings.mode === key
                                ? "#60a5fa"
                                : "white",
                            margin: 0,
                          }}
                        >
                          {ru ? info.label : info.labelEn}
                        </p>
                        <p
                          style={{
                            fontSize: "11px",
                            color: "rgba(255,255,255,0.4)",
                            margin: 0,
                          }}
                        >
                          {ru ? info.description : info.descriptionEn}
                        </p>
                      </div>
                      {motivationSettings.mode === key && (
                        <div
                          style={{
                            width: "18px",
                            height: "18px",
                            borderRadius: "50%",
                            backgroundColor: "#3b82f6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Check size={11} color="white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Количество уведомлений */}
                <p
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.4)",
                    margin: "0 0 8px 0",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {ru ? "Уведомлений в день" : "Per day"}
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "8px",
                    marginBottom: "20px",
                  }}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() =>
                        setMotivationSettings((prev) => ({
                          ...prev,
                          timesPerDay: n,
                        }))
                      }
                      style={{
                        height: "44px",
                        borderRadius: "12px",
                        border:
                          motivationSettings.timesPerDay === n
                            ? "1px solid #3b82f6"
                            : "1px solid rgba(255,255,255,0.08)",
                        backgroundColor:
                          motivationSettings.timesPerDay === n
                            ? "rgba(59,130,246,0.2)"
                            : "rgba(255,255,255,0.04)",
                        color:
                          motivationSettings.timesPerDay === n
                            ? "#60a5fa"
                            : "rgba(255,255,255,0.6)",
                        fontSize: "16px",
                        fontWeight:
                          motivationSettings.timesPerDay === n ? 700 : 400,
                        cursor: "pointer",
                      }}
                    >
                      {n}×
                    </button>
                  ))}
                </div>

                {/* Расписание */}
                <div
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    marginBottom: "16px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.5)",
                      margin: 0,
                    }}
                  >
                    📅{" "}
                    {ru ? "Примерное расписание:" : "Approximate schedule:"}
                    {" "}
                    {motivationSettings.timesPerDay === 1 && "14:00"}
                    {motivationSettings.timesPerDay === 2 && "10:00, 19:00"}
                    {motivationSettings.timesPerDay === 3 && "9:00, 14:00, 20:00"}
                    {motivationSettings.timesPerDay === 4 && "9:00, 13:00, 17:00, 20:00"}
                    {motivationSettings.timesPerDay === 5 && "8:00, 11:00, 14:00, 17:00, 20:00"}
                  </p>
                </div>

                {/* Подсказка про тест */}
                <div
                  style={{
                    backgroundColor: "rgba(59,130,246,0.06)",
                    border: "1px solid rgba(59,130,246,0.15)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    marginBottom: "16px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.4)",
                      margin: 0,
                    }}
                  >
                    💡{" "}
                    {ru
                      ? "Проверить: напиши /test_motivation боту @aiplannerrubot"
                      : "Test: send /test_motivation to @aiplannerrubot"}
                  </p>
                </div>
              </>
            )}

            <button
              onClick={() => handleSaveMotivationSettings(motivationSettings)}
              disabled={motivationLoading}
              style={{
                width: "100%",
                height: "46px",
                borderRadius: "12px",
                border: "none",
                backgroundColor: "#3b82f6",
                fontSize: "14px",
                fontWeight: 600,
                color: "white",
                cursor: motivationLoading ? "default" : "pointer",
                opacity: motivationLoading ? 0.7 : 1,
              }}
            >
              {motivationLoading
                ? ru ? "Запрашиваем доступ..." : "Requesting access..."
                : ru ? "Сохранить настройки" : "Save settings"}
            </button>
          </div>
        </div>
      )}

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
