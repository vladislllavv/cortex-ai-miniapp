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

const ASSISTANT_NAME_KEY = "cortex-assistant-name";

function getAssistantName(): string {
  return localStorage.getItem(ASSISTANT_NAME_KEY) || "CortexAI";
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ============ ПАРСИНГ ВРЕМЕНИ ============

function parseTimeFromText(inputText: string): Date | null {
  const now = new Date();
  const lower = inputText.toLowerCase();

  const minMatch = lower.match(/через\s+(\d+)\s*мин/);
  if (minMatch) {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() + parseInt(minMatch[1]));
    return d;
  }

  const hourMatch = lower.match(/через\s+(\d+)\s*час/);
  if (hourMatch) {
    const d = new Date(now);
    d.setHours(d.getHours() + parseInt(hourMatch[1]));
    return d;
  }

  if (lower.includes("в час") || lower.includes("в один час")) {
    const d = new Date(now);
    d.setHours(13, 0, 0);
    if (d < now) d.setDate(d.getDate() + 1);
    return d;
  }

  const wordHours: Record<string, number> = {
    "два": 14, "три": 15, "четыре": 16, "пять": 17,
    "шесть": 18, "семь": 19, "восемь": 20, "девять": 21,
    "десять": 22, "одиннадцать": 23, "двенадцать": 12,
  };
  for (const [word, hour] of Object.entries(wordHours)) {
    if (lower.includes(`в ${word}`)) {
      const d = new Date(now);
      d.setHours(hour, 0, 0);
      if (d < now) d.setDate(d.getDate() + 1);
      return d;
    }
  }

  const timeMatch = lower.match(/в\s+(\d{1,2})[:\s]?(\d{2})?/);
  if (timeMatch) {
    const d = new Date(now);
    d.setHours(parseInt(timeMatch[1]));
    d.setMinutes(timeMatch[2] ? parseInt(timeMatch[2]) : 0);
    d.setSeconds(0);
    if (d < now) d.setDate(d.getDate() + 1);
    return d;
  }

  if (lower.includes("завтра")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const m = lower.match(/завтра.*в\s+(\d{1,2})[:\s]?(\d{2})?/);
    if (m) { d.setHours(parseInt(m[1])); d.setMinutes(m[2] ? parseInt(m[2]) : 0); }
    else d.setHours(9, 0, 0);
    return d;
  }

  if (lower.includes("сегодня")) {
    const d = new Date(now);
    const m = lower.match(/сегодня.*в\s+(\d{1,2})[:\s]?(\d{2})?/);
    if (m) { d.setHours(parseInt(m[1])); d.setMinutes(m[2] ? parseInt(m[2]) : 0); d.setSeconds(0); }
    else d.setHours(18, 0, 0);
    return d;
  }

  if (lower.includes("послезавтра")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    d.setHours(9, 0, 0);
    return d;
  }

  return null;
}

function detectPriority(inputText: string): "low" | "medium" | "high" {
  const lower = inputText.toLowerCase();
  if (["срочно", "важно", "критично", "немедленно", "asap", "urgent"].some((w) => lower.includes(w))) return "high";
  if (["когда-нибудь", "не срочно", "потом", "maybe"].some((w) => lower.includes(w))) return "low";
  return "medium";
}

function isTaskCreationIntent(inputText: string): boolean {
  const lower = inputText.toLowerCase();
  return ["напомни", "напоминание", "создай задачу", "нужно", "надо", "поставь", "запланируй", "встреча", "совещание", "созвон", "позвонить", "купить", "сделать", "отправить", "написать", "зайти", "remind", "todo", "need to", "meeting"].some((k) => lower.includes(k));
}

function extractTaskTitle(inputText: string): string {
  let title = inputText;
  const prefixes = ["напомни мне", "напомни", "создай задачу", "нужно", "надо", "поставь", "запланируй", "remind me to", "add task", "i need to"];
  const lower = title.toLowerCase();
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) { title = title.slice(prefix.length).trim(); break; }
  }
  title = title
    .replace(/через\s+\d+\s*(минут|час|день|мин|ч)/gi, "")
    .replace(/в\s+\d{1,2}[:\s]\d{2}/gi, "")
    .replace(/в\s+\d{1,2}/gi, "")
    .replace(/завтра|сегодня|послезавтра|утром|вечером|ночью/gi, "")
    .replace(/срочно|важно|критично/gi, "")
    .trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

interface AIResult {
  responseText: string;
  task: { title: string; dueDate?: string; priority: string } | null;
  needsTime?: boolean;
  pendingTitle?: string;
}

function generateAIResponse(
  userText: string,
  tasks: any[],
  language: string,
  birthdays: any[],
  assistantName: string,
  pendingTask?: { title: string }
): AIResult {
  const ru = language === "ru";
  const lower = userText.toLowerCase();
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  if (pendingTask) {
    const dueDate = parseTimeFromText(userText);
    if (dueDate) {
      const timeStr = dueDate.toLocaleString(ru ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
      return {
        responseText: ru
          ? `✅ Отлично! ${assistantName} поставила напоминание.\n\n📌 ${pendingTask.title}\n⏰ ${timeStr}\n\nЗадача добавлена в список!`
          : `✅ Done! ${assistantName} set a reminder.\n\n📌 ${pendingTask.title}\n⏰ ${timeStr}\n\nTask added to list!`,
        task: { title: pendingTask.title, dueDate: dueDate.toISOString(), priority: detectPriority(userText) },
      };
    }
    return {
      responseText: ru
        ? `Не понял время 🤔 Уточни: "в 15:00", "через 30 минут", "завтра в 9"`
        : `Couldn't parse time 🤔 Try: "at 15:00", "in 30 minutes", "tomorrow at 9"`,
      task: null, needsTime: true, pendingTitle: pendingTask.title,
    };
  }

  if (lower.includes("что у меня") || lower.includes("какие задачи") || lower.includes("на сегодня") || lower.includes("что сегодня") || lower.includes("today tasks") || lower.includes("what do i have")) {
    const todayTasks = tasks.filter((t) => t.dueDate?.startsWith(todayStr));
    const holidayToday = isHoliday(todayStr);
    const weekendToday = isWeekend(todayStr);
    const month = todayStr.slice(5, 7);
    const day = todayStr.slice(8, 10);
    const todayBirthdays = birthdays.filter((b: any) => b.date === `${month}-${day}`);

    let response = ru
      ? `📅 Сегодня, ${now.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}:\n\n`
      : `📅 Today, ${now.toLocaleDateString("en-US", { day: "numeric", month: "long" })}:\n\n`;

    if (holidayToday) response += `🎉 ${getHolidayName(todayStr)}\n\n`;
    if (weekendToday && !holidayToday) response += `🏖️ ${ru ? "Выходной день" : "Weekend"}\n\n`;
    if (todayBirthdays.length > 0) response += `🎂 ${ru ? "День рождения" : "Birthday"}: ${todayBirthdays.map((b: any) => b.name).join(", ")}\n\n`;

    if (todayTasks.length === 0) {
      response += ru ? "✅ Задач на сегодня нет!" : "✅ No tasks today!";
    } else {
      response += ru ? `📋 Задачи (${todayTasks.length}):\n` : `📋 Tasks (${todayTasks.length}):\n`;
      todayTasks.forEach((t, i) => {
        const time = t.dueDate ? new Date(t.dueDate).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
        response += `${i + 1}. ${t.status === "done" ? "✅" : "⬜"} ${t.title}${time ? ` — ${time}` : ""}\n`;
      });
    }
    return { responseText: response, task: null };
  }

  if (isTaskCreationIntent(userText)) {
    const dueDate = parseTimeFromText(userText);
    const title = extractTaskTitle(userText);
    const priority = detectPriority(userText);

    if (title.length > 2) {
      if (dueDate) {
        const timeStr = dueDate.toLocaleString(ru ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
        return {
          responseText: ru
            ? `✅ Хорошо, ${assistantName} поставила напоминание.\n\n📌 ${title}\n⏰ ${timeStr}\n\nЗа сколько напомнить заранее? Или "без напоминания".`
            : `✅ Done, ${assistantName} set a reminder.\n\n📌 ${title}\n⏰ ${timeStr}\n\nHow early to remind? Or "no reminder".`,
          task: { title, dueDate: dueDate.toISOString(), priority },
        };
      }
      return {
        responseText: ru
          ? `📌 Понял: "${title}"\n\nКогда напомнить? Напиши время:\n"завтра в 10:00" или "через 2 часа"`
          : `📌 Got it: "${title}"\n\nWhen to remind? Write time:\n"tomorrow at 10:00" or "in 2 hours"`,
        task: null, needsTime: true, pendingTitle: title,
      };
    }
  }

  if (lower.includes("оптимиз") || lower.includes("optimize")) {
    if (activeTasks.length === 0) return { responseText: ru ? "Нет активных задач! 🎉" : "No active tasks! 🎉", task: null };
    const high = activeTasks.filter((t) => t.priority === "high");
    return {
      responseText: ru
        ? `📊 Анализ:\n\n• Активных: ${activeTasks.length}\n• Срочных: ${high.length}\n\n💡 Начни с: "${(high[0] || activeTasks[0]).title}"\n\n🎯 Фокус на одной задаче!`
        : `📊 Analysis:\n\n• Active: ${activeTasks.length}\n• Urgent: ${high.length}\n\n💡 Start: "${(high[0] || activeTasks[0]).title}"\n\n🎯 One task at a time!`,
      task: null,
    };
  }

  if (lower.includes("начать") || lower.includes("start") || lower.includes("с чего")) {
    if (activeTasks.length === 0) return { responseText: ru ? "Список пуст! 🎉" : "List is empty! 🎉", task: null };
    const first = activeTasks.find((t) => t.priority === "high") || activeTasks[0];
    return {
      responseText: ru
        ? `🚀 Начни с:\n\n📌 "${first.title}"\n\n✨ Правило 2 минут: меньше 2 мин — делай сейчас!\n\n💪 Ты справишься!`
        : `🚀 Start with:\n\n📌 "${first.title}"\n\n✨ 2-min rule: less than 2 min — do it now!\n\n💪 You got this!`,
      task: null,
    };
  }

  if (lower.includes("стресс") || lower.includes("stress") || lower.includes("устал") || lower.includes("тревог")) {
    const tips = ru
      ? ["🧘 Техника 4-7-8:\n\nВдох 4 сек → задержка 7 сек → выдох 8 сек.\n\nПовтори 3 раза. Снижает тревогу! ✨", "🌿 5-4-3-2-1:\n\n• 5 вещей видишь\n• 4 трогаешь\n• 3 слышишь\n• 2 чувствуешь\n• 1 на вкус\n\nВозвращает в настоящее 🙏", "💆 Раздели задачу на 3 шага.\n\nПервый шаг — 5 минут. Начни! 🚀"]
      : ["🧘 4-7-8: Inhale 4s → Hold 7s → Exhale 8s. Repeat 3x ✨", "🌿 5-4-3-2-1: 5 see, 4 touch, 3 hear, 2 smell, 1 taste 🙏", "💆 Break task into 3 steps. First = 5 min. Go! 🚀"];
    return { responseText: tips[Math.floor(Math.random() * tips.length)], task: null };
  }

  if (lower.includes("мотив") || lower.includes("лень") || lower.includes("motivat")) {
    return {
      responseText: ru
        ? "💪 Правило 5 секунд:\n\nСчитай 5-4-3-2-1 и начинай!\n\n🎯 Действие создаёт мотивацию!"
        : "💪 5-Second Rule:\n\nCount 5-4-3-2-1 and start!\n\n🎯 Action creates motivation!",
      task: null,
    };
  }

  if (lower.includes("продуктив") || lower.includes("эффектив") || lower.includes("productive")) {
    return {
      responseText: ru
        ? "⚡ Помодоро:\n\n• 25 мин работы\n• 5 мин отдыха\n• 4 цикла → 30 мин\n\n+40% к продуктивности! 🎯"
        : "⚡ Pomodoro:\n\n• 25 min work\n• 5 min rest\n• 4 cycles → 30 min break\n\n+40% productivity! 🎯",
      task: null,
    };
  }

  if (lower.includes("сколько") || lower.includes("статистик") || lower.includes("how many")) {
    const done = tasks.filter((t) => t.status === "done").length;
    return {
      responseText: ru
        ? `📊 Статистика:\n\n✅ Выполнено: ${done}\n📋 Активных: ${activeTasks.length}\n📁 Всего: ${tasks.length}`
        : `📊 Stats:\n\n✅ Done: ${done}\n📋 Active: ${activeTasks.length}\n📁 Total: ${tasks.length}`,
      task: null,
    };
  }

  if (lower.includes("как тебя зовут") || lower.includes("твоё имя") || lower.includes("your name") || lower.includes("who are you")) {
    return {
      responseText: ru ? `Меня зовут ${assistantName}! 😊 Я твой личный AI ассистент-планировщик.` : `My name is ${assistantName}! 😊 I'm your personal AI planning assistant.`,
      task: null,
    };
  }

  if (lower.includes("привет") || lower.includes("hello") || lower.includes("hi")) {
    return {
      responseText: ru
        ? `Привет! 👋 Я ${assistantName}.\n\nПопробуй:\n• "завтра в 12 совещание"\n• "что у меня сегодня?"\n• "я в стрессе"`
        : `Hello! 👋 I'm ${assistantName}.\n\nTry:\n• "meeting tomorrow at 12"\n• "what do I have today?"\n• "I'm stressed"`,
      task: null,
    };
  }

  const defaults = ru
    ? [`Попробуй написать задачу с временем:\n"завтра в 14:00 встреча" 📌`, `Могу показать задачи — напиши "что у меня сегодня?" 📅`, `Напиши задачу и время — ${assistantName} поставит напоминание! ⏰`]
    : [`Try a task with time:\n"meeting tomorrow at 14:00" 📌`, `Show tasks — write "what do I have today?" 📅`, `Write task and time — ${assistantName} will set reminder! ⏰`];
  return { responseText: defaults[Math.floor(Math.random() * defaults.length)], task: null };
}

const DEFAULT_MESSAGE = (ru: boolean, name: string): Message => ({
  role: "assistant",
  content: ru
    ? `Привет! 👋 Я ${name}, твой AI ассистент.\n\nПопробуй:\n• "завтра в 12:00 совещание" → поставлю напоминание\n• "что у меня сегодня?" → покажу список\n• "я в стрессе" → помогу\n• 🎤 Нажми микрофон для голосового ввода`
    : `Hi! 👋 I'm ${name}, your AI assistant.\n\nTry:\n• "meeting tomorrow at 12:00" → I'll set reminder\n• "what today?" → show list\n• "I'm stressed" → I'll help\n• 🎤 Tap mic for voice input`,
});

export default function AiProcessPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const birthdays = useTaskStore((state) => state.birthdays);
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
  const [aiUsageCount, setAiUsageCount] = useState(() => {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(`ai-usage-${today}`);
    return stored ? parseInt(stored) : 0;
  });
  const [pendingTask, setPendingTask] = useState<{ title: string } | null>(null);

  // Голосовой ввод
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Копирование
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const AI_FREE_LIMIT = 20;

  useEffect(() => {
    const userId = getTelegramUserId();
    checkSubscription(userId).then(setHasSubscription);
  }, []);

  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Инициализация голосового ввода
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(ru ? "Голосовой ввод не поддерживается в этом браузере" : "Voice input not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = ru ? "ru-RU" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(index);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const el = document.createElement("textarea");
      el.value = content;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedId(index);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const saveName = () => {
    if (!newName.trim()) return;
    localStorage.setItem(ASSISTANT_NAME_KEY, newName.trim());
    setAssistantName(newName.trim());
    setNewName("");
    setShowNameEdit(false);
  };

  const quickQuestions = ru
    ? ["что у меня сегодня?", "оптимизируй задачи", "я в стрессе", "с чего начать?"]
    : ["what do I have today?", "optimize tasks", "I'm stressed", "where to start?"];

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    if (!hasSubscription && aiUsageCount >= AI_FREE_LIMIT) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(ru ? `Лимит ${AI_FREE_LIMIT} запросов исчерпан 🤖\n\nОформи подписку.\n\nНапиши боту /subscribe` : `AI limit reached.\n\nGet subscription.\n\nSend /subscribe`);
      tg?.openTelegramLink("https://t.me/aiplannerrubot");
      return;
    }

    const userMessage: Message = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];
    const newCount = aiUsageCount + 1;
    setAiUsageCount(newCount);
    localStorage.setItem(`ai-usage-${today}`, String(newCount));

    await new Promise((resolve) => setTimeout(resolve, 500));

    const { responseText, task, needsTime, pendingTitle } = generateAIResponse(
      messageText, tasks, language, birthdays, assistantName, pendingTask || undefined
    );

    if (task && task.title) {
      await addTask({ title: task.title, dueDate: task.dueDate, priority: task.priority as any, status: "todo", isAiCreated: true, repeat: "none" });
      setPendingTask(null);
    } else if (needsTime && pendingTitle) {
      setPendingTask({ title: pendingTitle });
    } else {
      setPendingTask(null);
    }

    setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);
    setLoading(false);
  };

  const isLimited = !hasSubscription && aiUsageCount >= AI_FREE_LIMIT;

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
            <button
              onClick={() => { setNewName(assistantName); setShowNameEdit(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}
            >
              ✏️
            </button>
          </div>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {hasSubscription ? (ru ? "Подписка ✅" : "Subscription ✅") : ru ? `${Math.max(0, AI_FREE_LIMIT - aiUsageCount)} запросов` : `${Math.max(0, AI_FREE_LIMIT - aiUsageCount)} left`}
          </p>
        </div>
      </div>

      {/* Редактирование имени */}
      {showNameEdit && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px", flexShrink: 0 }}>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>
            {ru ? "Имя ассистента" : "Assistant name"}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              placeholder={ru ? "Введи имя..." : "Enter name..."}
              style={{ flex: 1, height: "34px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "10px", paddingRight: "10px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit" }}
            />
            <button onClick={saveName} style={{ height: "34px", paddingLeft: "12px", paddingRight: "12px", borderRadius: "8px", border: "none", backgroundColor: "#3b82f6", color: "white", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              {ru ? "Сохранить" : "Save"}
            </button>
            <button onClick={() => setShowNameEdit(false)} style={{ height: "34px", paddingLeft: "10px", paddingRight: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", color: "rgba(255,255,255,0.5)", fontSize: "12px", cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Ожидание времени */}
      {pendingTask && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "8px 12px", marginBottom: "8px", flexShrink: 0 }}>
          <p style={{ fontSize: "12px", color: "#93c5fd", margin: 0 }}>
            ⏰ {ru ? `Жду время для: "${pendingTask.title}"` : `Waiting time for: "${pendingTask.title}"`}
          </p>
        </div>
      )}

      {/* Лимит */}
      {isLimited && (
        <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "8px 12px", marginBottom: "8px", flexShrink: 0, textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: "#fca5a5", margin: 0 }}>
            {ru ? "Лимит исчерпан 🤖\nОформи подписку" : "Limit reached 🤖\nGet subscription"}
          </p>
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
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" as any, display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "4px", minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", position: "relative" }}>
              <div style={{
                padding: "9px 13px",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                backgroundColor: msg.role === "user" ? "#3b82f6" : "rgba(255,255,255,0.07)",
                border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}>
                <p style={{ fontSize: "14px", color: msg.role === "user" ? "white" : "rgba(255,255,255,0.9)", margin: 0, lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.content}
                </p>
              </div>

              {/* Кнопка копирования */}
              <button
                onClick={() => copyMessage(msg.content, i)}
                style={{
                  position: "absolute",
                  bottom: "-20px",
                  right: msg.role === "user" ? "0" : "auto",
                  left: msg.role === "assistant" ? "0" : "auto",
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "3px",
                  padding: "2px 4px",
                }}
              >
                {copiedId === i
                  ? <Check size={11} color="#22c55e" />
                  : <Copy size={11} color="rgba(255,255,255,0.25)" />}
                {copiedId === i && (
                  <span style={{ fontSize: "10px", color: "#22c55e" }}>{ru ? "Скопировано" : "Copied"}</span>
                )}
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
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>

        {/* Кнопка микрофона */}
        <button
          onClick={isListening ? stopListening : startListening}
          style={{
            width: "40px", height: "40px", minWidth: "40px",
            borderRadius: "50%",
            backgroundColor: isListening ? "#ef4444" : "rgba(255,255,255,0.08)",
            border: isListening ? "2px solid #fca5a5" : "none",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            animation: isListening ? "pulse 1s ease-in-out infinite" : "none",
          }}
        >
          {isListening ? <MicOff size={16} color="white" /> : <Mic size={16} color="rgba(255,255,255,0.6)" />}
        </button>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={
            isListening
              ? (ru ? "Говори..." : "Speaking...")
              : isLimited
              ? (ru ? "Лимит..." : "Limit...")
              : pendingTask
              ? (ru ? "Укажи время..." : "Enter time...")
              : (ru ? "Напиши задачу или вопрос..." : "Write task or question...")
          }
          disabled={isLimited}
          rows={1}
          style={{
            flex: 1,
            backgroundColor: isListening
              ? "rgba(239,68,68,0.1)"
              : isLimited ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)",
            border: isListening ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px", padding: "10px 12px",
            fontSize: "16px", color: isLimited ? "rgba(255,255,255,0.3)" : "white",
            outline: "none", resize: "none", maxHeight: "70px",
            overflowY: "auto", boxSizing: "border-box", fontFamily: "inherit",
          }}
        />

        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading || isLimited}
          style={{
            width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%",
            backgroundColor: input.trim() && !loading && !isLimited ? "#3b82f6" : "rgba(255,255,255,0.08)",
            border: "none", cursor: input.trim() && !loading && !isLimited ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
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
