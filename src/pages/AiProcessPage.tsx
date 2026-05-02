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
const AI_FREE_LIMIT = 5;
const AI_USAGE_KEY = "cortex-ai-usage";

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

function setAiUsage(count: number) {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem(AI_USAGE_KEY, JSON.stringify({ date: today, count }));
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

function parseTimeFromText(inputText: string): Date | null {
  const now = new Date();
  const lower = inputText.toLowerCase().trim();

  const minMatch = lower.match(/через\s+(\d+)\s*(минут|мин|m)/);
  if (minMatch) {
    const d = new Date(now);
    d.setMinutes(d.getMinutes() + parseInt(minMatch[1]));
    return d;
  }

  const hourMatch = lower.match(/через\s+(\d+)\s*(часов|часа|час|ч|h)/);
  if (hourMatch) {
    const d = new Date(now);
    d.setHours(d.getHours() + parseInt(hourMatch[1]));
    return d;
  }

  const dayMatch = lower.match(/через\s+(\d+)\s*(дней|дня|день)/);
  if (dayMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() + parseInt(dayMatch[1]));
    d.setHours(9, 0, 0);
    return d;
  }

  if (/в\s+час\b/.test(lower)) {
    const d = new Date(now);
    d.setHours(13, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }

  const wordHours: Record<string, number> = {
    "полночь": 0, "полдень": 12,
    "два": 14, "двух": 14, "двенадцать": 12,
    "три": 15, "трёх": 15, "четыре": 16, "четырёх": 16,
    "пять": 17, "пяти": 17, "шесть": 18, "шести": 18,
    "семь": 19, "семи": 19, "восемь": 20, "восьми": 20,
    "девять": 21, "девяти": 21, "десять": 22, "десяти": 22,
    "одиннадцать": 23, "одиннадцати": 23,
  };

  for (const [word, hour] of Object.entries(wordHours)) {
    if (new RegExp(`в\\s+${word}\\b`).test(lower)) {
      const d = new Date(now);
      d.setHours(hour, 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d;
    }
  }

  const timeMatch = lower.match(/в\s+(\d{1,2})(?::(\d{2}))?(?:\s|$)/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const d = new Date(now);
      d.setHours(hour, minute, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
      return d;
    }
  }

  if (lower.includes("завтра")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    const m = lower.match(/в\s+(\d{1,2})(?::(\d{2}))?/);
    if (m) { d.setHours(parseInt(m[1]), m[2] ? parseInt(m[2]) : 0, 0, 0); }
    else { d.setHours(9, 0, 0, 0); }
    return d;
  }

  if (lower.includes("послезавтра")) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    const m = lower.match(/в\s+(\d{1,2})(?::(\d{2}))?/);
    if (m) { d.setHours(parseInt(m[1]), m[2] ? parseInt(m[2]) : 0, 0, 0); }
    else { d.setHours(9, 0, 0, 0); }
    return d;
  }

  if (lower.includes("сегодня")) {
    const d = new Date(now);
    const m = lower.match(/в\s+(\d{1,2})(?::(\d{2}))?/);
    if (m) {
      d.setHours(parseInt(m[1]), m[2] ? parseInt(m[2]) : 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
    } else {
      d.setHours(18, 0, 0, 0);
      if (d <= now) d.setDate(d.getDate() + 1);
    }
    return d;
  }

  if (lower.includes("утром")) {
    const d = new Date(now);
    d.setHours(9, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes("вечером")) {
    const d = new Date(now);
    d.setHours(19, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes("ночью") || lower.includes("ночь")) {
    const d = new Date(now);
    d.setHours(23, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes("днём") || lower.includes("днем")) {
    const d = new Date(now);
    d.setHours(13, 0, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
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
  const hasDirectTimePhrase =
    /напомни\s+(сегодня|завтра|через|утром|вечером|ночью|в\s+\d)/.test(lower) ||
    /remind\s+(today|tomorrow|in\s+\d|tonight)/.test(lower);
  if (hasDirectTimePhrase) return true;
  return [
    "напомни", "напоминание", "создай задачу", "нужно", "надо",
    "поставь", "запланируй", "встреча", "совещание", "созвон",
    "позвонить", "купить", "сделать", "отправить", "написать",
    "зайти", "remind", "todo", "need to", "meeting",
  ].some((k) => lower.includes(k));
}

function extractTaskTitle(inputText: string): string {
  let title = inputText;
  const prefixes = [
    "напомни мне", "напомни", "создай задачу", "нужно", "надо",
    "поставь", "запланируй", "remind me to", "add task", "i need to",
  ];
  const lower = title.toLowerCase();
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) { title = title.slice(prefix.length).trim(); break; }
  }
  title = title
    .replace(/через\s+\d+\s*(минут|час|день|мин|ч|дней|дня)/gi, "")
    .replace(/в\s+\d{1,2}:\d{2}/gi, "")
    .replace(/в\s+\d{1,2}(?=\s|$)/gi, "")
    .replace(/завтра|сегодня|послезавтра|утром|вечером|ночью|днём|днем/gi, "")
    .replace(/срочно|важно|критично/gi, "")
    .trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function parseReminderAdvance(inputText: string): number | null {
  const lower = inputText.toLowerCase();
  if (lower.includes("без напомин") || lower.includes("no reminder") || lower.includes("не надо")) return 0;
  const minMatch = lower.match(/за\s+(\d+)\s*мин/);
  if (minMatch) return parseInt(minMatch[1]);
  const hourMatch = lower.match(/за\s+(\d+)\s*час/);
  if (hourMatch) return parseInt(hourMatch[1]) * 60;
  if (lower.includes("за день") || lower.includes("за сутки")) return 24 * 60;
  if (lower.includes("за час")) return 60;
  if (lower.includes("за полчаса") || lower.includes("за 30")) return 30;
  if (lower.includes("за 15")) return 15;
  if (lower.includes("за 10")) return 10;
  if (lower.includes("за 5")) return 5;
  return null;
}

interface AIResult {
  responseText: string;
  task: { title: string; dueDate?: string; priority: string } | null;
  needsTime?: boolean;
  pendingTitle?: string;
  needsAdvance?: boolean;
}

function generateAIResponse(
  userText: string,
  tasks: any[],
  language: string,
  birthdays: any[],
  assistantName: string,
  pendingTask?: { title: string; dueDate?: string } | null,
  waitingAdvance?: boolean
): AIResult {
  const ru = language === "ru";
  const lower = userText.toLowerCase();
  const activeTasks = tasks.filter((t) => t.status !== "done");
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  if (waitingAdvance && pendingTask?.dueDate) {
    const advance = parseReminderAdvance(userText);
    if (advance !== null) {
      return {
        responseText: ru
          ? `✅ Готово! Задача создана.\n\n📌 ${pendingTask.title}${advance > 0 ? `\n⏰ Напомню за ${advance} мин до события` : ""}`
          : `✅ Done! Task created.\n\n📌 ${pendingTask.title}${advance > 0 ? `\n⏰ Will remind ${advance} min before` : ""}`,
        task: { title: pendingTask.title, dueDate: pendingTask.dueDate, priority: "medium" },
      };
    }
    return {
      responseText: ru ? `✅ Задача создана!\n\n📌 ${pendingTask.title}` : `✅ Task created!\n\n📌 ${pendingTask.title}`,
      task: { title: pendingTask.title, dueDate: pendingTask.dueDate, priority: "medium" },
    };
  }

  if (pendingTask && !pendingTask.dueDate) {
    const dueDate = parseTimeFromText(userText);
    if (dueDate) {
      const timeStr = dueDate.toLocaleString(ru ? "ru-RU" : "en-US", {
        hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
      });
      return {
        responseText: ru
          ? `✅ ${assistantName} поставила напоминание.\n\n📌 ${pendingTask.title}\n⏰ ${timeStr}\n\nЗа сколько напомнить заранее?\n(за 15 мин / за час / без напоминания)`
          : `✅ ${assistantName} set reminder.\n\n📌 ${pendingTask.title}\n⏰ ${timeStr}\n\nHow early to remind?\n(15 min / 1 hour / no reminder)`,
        task: null, needsAdvance: true, pendingTitle: pendingTask.title,
      };
    }
    return {
      responseText: ru
        ? `Не понял время 🤔\n\nУточни:\n"завтра в 10:00"\n"через 2 часа"\n"сегодня вечером"`
        : `Couldn't parse time 🤔\n\nTry:\n"tomorrow at 10:00"\n"in 2 hours"\n"this evening"`,
      task: null, needsTime: true, pendingTitle: pendingTask.title,
    };
  }

  const quickTimePatterns = [
    /напомни\s+сегодня/, /напомни\s+завтра/, /напомни\s+через/,
    /напомни\s+утром/, /напомни\s+вечером/, /напомни\s+ночью/, /напомни\s+в\s+\d/,
    /remind\s+today/, /remind\s+tomorrow/, /remind\s+in\s+\d/,
  ];

  if (quickTimePatterns.some((p) => p.test(lower))) {
    const dueDate = parseTimeFromText(userText);
    const rawTitle = userText.replace(/напомни\s+(мне\s+)?/gi, "").replace(/remind\s+(me\s+)?/gi, "").trim();
    const title = extractTaskTitle(rawTitle) || (ru ? "Напоминание" : "Reminder");
    if (dueDate) {
      const timeStr = dueDate.toLocaleString(ru ? "ru-RU" : "en-US", {
        hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
      });
      return {
        responseText: ru
          ? `✅ Поставила напоминание!\n\n📌 ${title}\n⏰ ${timeStr}`
          : `✅ Reminder set!\n\n📌 ${title}\n⏰ ${timeStr}`,
        task: { title, dueDate: dueDate.toISOString(), priority: "medium" },
      };
    }
  }

  if (
    lower.includes("что у меня") || lower.includes("какие задачи") ||
    lower.includes("на сегодня") || lower.includes("что сегодня") ||
    lower.includes("today tasks") || lower.includes("what do i have")
  ) {
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
    if (todayBirthdays.length > 0) {
      response += `🎂 ${ru ? "День рождения" : "Birthday"}: ${todayBirthdays.map((b: any) => b.name).join(", ")}\n\n`;
    }
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
        const timeStr = dueDate.toLocaleString(ru ? "ru-RU" : "en-US", {
          hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
        });
        return {
          responseText: ru
            ? `✅ Хорошо, ${assistantName} поставила напоминание.\n\n📌 ${title}\n⏰ ${timeStr}\n\nЗа сколько напомнить заранее?\n(за 15 мин / за час / без напоминания)`
            : `✅ Done, ${assistantName} set reminder.\n\n📌 ${title}\n⏰ ${timeStr}\n\nHow early to remind?\n(15 min / 1 hour / no reminder)`,
          task: null, needsAdvance: true, pendingTitle: title,
        };
      }
      return {
        responseText: ru
          ? `📌 Понял: "${title}"\n\n⚠️ Задачи создаются только с датой и временем.\n\nКогда напомнить?\n"завтра в 10:00" / "через 2 часа" / "сегодня вечером"`
          : `📌 Got it: "${title}"\n\n⚠️ Tasks require date and time.\n\nWhen?\n"tomorrow at 10:00" / "in 2 hours" / "this evening"`,
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
        ? `🚀 Начни с:\n\n📌 "${first.title}"\n\n✨ Правило 2 минут!\n\n💪 Ты справишься!`
        : `🚀 Start with:\n\n📌 "${first.title}"\n\n✨ 2-min rule!\n\n💪 You got this!`,
      task: null,
    };
  }

  if (lower.includes("стресс") || lower.includes("stress") || lower.includes("устал") || lower.includes("тревог")) {
    const tips = ru
      ? [
          "🧘 Техника 4-7-8:\n\nВдох 4 сек → задержка 7 сек → выдох 8 сек.\n\nПовтори 3 раза. ✨",
          "🌿 Метод 5-4-3-2-1:\n\n• 5 вещей видишь\n• 4 трогаешь\n• 3 слышишь\n• 2 чувствуешь\n• 1 на вкус 🙏",
          "💆 Раздели задачу на 3 шага. Первый — 5 минут. Начни! 🚀",
        ]
      : [
          "🧘 4-7-8: Inhale 4s → Hold 7s → Exhale 8s. Repeat 3x ✨",
          "🌿 5-4-3-2-1: 5 see, 4 touch, 3 hear, 2 smell, 1 taste 🙏",
          "💆 Break task into 3 steps. First = 5 min. Go! 🚀",
        ];
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
        ? "⚡ Помодоро:\n\n• 25 мин работы\n• 5 мин отдыха\n• 4 цикла → 30 мин\n\n+40%! 🎯"
        : "⚡ Pomodoro:\n\n• 25 min work\n• 5 min rest\n• 4 cycles → 30 min\n\n+40%! 🎯",
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
      responseText: ru
        ? `Меня зовут ${assistantName}! 😊`
        : `My name is ${assistantName}! 😊`,
      task: null,
    };
  }

  if (lower.includes("привет") || lower.includes("hello") || lower.includes("hi")) {
    return {
      responseText: ru
        ? `Привет! 👋 Я ${assistantName}.\n\nПопробуй:\n• "напомни завтра в 10 встреча"\n• "что у меня сегодня?"\n• 🎤 Нажми микрофон`
        : `Hello! 👋 I'm ${assistantName}.\n\nTry:\n• "remind tomorrow at 10 meeting"\n• "what do I have today?"\n• 🎤 Tap mic`,
      task: null,
    };
  }

  if (lower.includes("помог") || lower.includes("help") || lower.includes("умеешь")) {
    return {
      responseText: ru
        ? `🤖 ${assistantName} умеет:\n\n📌 "напомни завтра в 10 встреча"\n📌 "через 30 мин позвонить"\n📅 "что у меня сегодня?"\n📊 "оптимизируй задачи"\n🧘 "я в стрессе"`
        : `🤖 ${assistantName} can:\n\n📌 "remind tomorrow at 10"\n📌 "in 30 min call"\n📅 "what today?"\n📊 "optimize tasks"\n🧘 "I'm stressed"`,
      task: null,
    };
  }

  const defaults = ru
    ? [
        `Попробуй: "напомни завтра в 14:00 встреча" 📌`,
        `Напиши "что у меня сегодня?" чтобы увидеть план 📅`,
        `Напиши задачу с временем — ${assistantName} поставит напоминание! ⏰`,
      ]
    : [
        `Try: "remind tomorrow at 14:00 meeting" 📌`,
        `Write "what do I have today?" to see your plan 📅`,
        `Write task with time — ${assistantName} will set reminder! ⏰`,
      ];

  return { responseText: defaults[Math.floor(Math.random() * defaults.length)], task: null };
}

const DEFAULT_MESSAGE = (ru: boolean, name: string): Message => ({
  role: "assistant",
  content: ru
    ? `Привет! 👋 Я ${name}, твой AI ассистент.\n\nПопробуй:\n• "напомни завтра в 12:00 совещание"\n• "напомни сегодня вечером позвонить"\n• "через час купить продукты"\n• "что у меня сегодня?"\n• 🎤 Нажми микрофон\n\n⚠️ Задачи создаются только с датой и временем`
    : `Hi! 👋 I'm ${name}, your AI assistant.\n\nTry:\n• "remind tomorrow at 12:00 meeting"\n• "remind today evening call"\n• "in 1 hour buy groceries"\n• "what do I have today?"\n• 🎤 Tap mic\n\n⚠️ Tasks require date and time`,
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
  const [aiUsageCount, setAiUsageCount] = useState(() => getAiUsage());
  const [pendingTask, setPendingTask] = useState<{ title: string; dueDate?: string } | null>(null);
  const [waitingAdvance, setWaitingAdvance] = useState(false);

  const sendingRef = useRef(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userId = getTelegramUserId();
    checkSubscription(userId).then(setHasSubscription);
  }, []);

  useEffect(() => {
    if (hasSubscription === true) setAiUsageCount(0);
  }, [hasSubscription]);

  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

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
    const handleVisibility = () => {
      if (document.hidden && recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setIsListening(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(ru ? "Голосовой ввод не поддерживается" : "Voice input not supported");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = ru ? "ru-RU" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      setInput(event.results[0][0].transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
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
    ? ["что у меня сегодня?", "напомни завтра утром", "я в стрессе", "с чего начать?"]
    : ["what do I have today?", "remind tomorrow morning", "I'm stressed", "where to start?"];

  const sendMessage = async (text?: string) => {
    if (sendingRef.current) return;
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    if (hasSubscription === false && aiUsageCount >= AI_FREE_LIMIT) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(
        ru
          ? `Лимит ${AI_FREE_LIMIT} запросов в день 🤖\n\nОформи подписку.\n\nНапиши боту /subscribe`
          : `Daily limit of ${AI_FREE_LIMIT} requests 🤖\n\nGet subscription.\n\nSend /subscribe`
      );
      tg?.openTelegramLink("https://t.me/aiplannerrubot");
      return;
    }

    sendingRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content: messageText }]);
    setInput("");
    setLoading(true);

    if (hasSubscription === false) {
      const newCount = aiUsageCount + 1;
      setAiUsageCount(newCount);
      setAiUsage(newCount);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const { responseText, task, needsTime, pendingTitle, needsAdvance } = generateAIResponse(
      messageText, tasks, language, birthdays, assistantName, pendingTask, waitingAdvance
    );

    if (task && task.title) {
      await addTask({ title: task.title, dueDate: task.dueDate, priority: task.priority as any, status: "todo", isAiCreated: true, repeat: "none", type: "task" });
      setPendingTask(null);
      setWaitingAdvance(false);
    } else if (needsAdvance && pendingTitle) {
      const dueDate = parseTimeFromText(messageText);
      setPendingTask({ title: pendingTitle, dueDate: dueDate?.toISOString() });
      setWaitingAdvance(true);
    } else if (needsTime && pendingTitle) {
      setPendingTask({ title: pendingTitle });
      setWaitingAdvance(false);
    } else {
      setPendingTask(null);
      setWaitingAdvance(false);
    }

    setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);
    setLoading(false);
    sendingRef.current = false;
  };

  const isLimited = hasSubscription === false && aiUsageCount >= AI_FREE_LIMIT;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxHeight: "calc(100vh - 120px)", overflow: "hidden" }}>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexShrink: 0 }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Bot size={18} color="#3b82f6" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "white", margin: 0 }}>{assistantName}</p>
            <button onClick={() => { setNewName(assistantName); setShowNameEdit(true); }} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", fontSize: "12px", color: "rgba(255,255,255,0.3)" }}>✏️</button>
          </div>
          <p style={{ fontSize: "11px", color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.4)", margin: 0 }}>
            {hasSubscription === null ? (ru ? "Загрузка..." : "Loading...") : hasSubscription ? (ru ? "Подписка активна ✅" : "Subscription active ✅") : isLimited ? (ru ? "Лимит исчерпан" : "Limit reached") : ru ? `${AI_FREE_LIMIT - aiUsageCount} из ${AI_FREE_LIMIT} запросов` : `${AI_FREE_LIMIT - aiUsageCount} of ${AI_FREE_LIMIT} requests`}
          </p>
        </div>
      </div>

      {showNameEdit && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "12px", padding: "10px 12px", marginBottom: "8px", flexShrink: 0 }}>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>{ru ? "Имя ассистента" : "Assistant name"}</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveName()} placeholder={ru ? "Введи имя..." : "Enter name..."} style={{ flex: 1, height: "34px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "10px", paddingRight: "10px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit" }} />
            <button onClick={saveName} style={{ height: "34px", paddingLeft: "12px", paddingRight: "12px", borderRadius: "8px", border: "none", backgroundColor: "#3b82f6", color: "white", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>{ru ? "Сохранить" : "Save"}</button>
            <button onClick={() => setShowNameEdit(false)} style={{ height: "34px", paddingLeft: "10px", paddingRight: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", color: "rgba(255,255,255,0.5)", fontSize: "12px", cursor: "pointer" }}>✕</button>
          </div>
        </div>
      )}

      {(pendingTask || waitingAdvance) && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "10px", padding: "8px 12px", marginBottom: "8px", flexShrink: 0 }}>
          <p style={{ fontSize: "12px", color: "#93c5fd", margin: 0 }}>
            {waitingAdvance ? (ru ? `⏰ За сколько напомнить о "${pendingTask?.title}"?` : `⏰ How early to remind about "${pendingTask?.title}"?`) : (ru ? `📌 Жду время для: "${pendingTask?.title}"` : `📌 Waiting time for: "${pendingTask?.title}"`)}
          </p>
        </div>
      )}

      {isLimited && (
        <div style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "8px 12px", marginBottom: "8px", flexShrink: 0, textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: "#fca5a5", margin: "0 0 6px 0" }}>{ru ? `Лимит ${AI_FREE_LIMIT} запросов в день 🤖` : `Daily limit of ${AI_FREE_LIMIT} requests 🤖`}</p>
          <button onClick={() => { const tg = (window as any).Telegram?.WebApp; tg?.openTelegramLink("https://t.me/aiplannerrubot"); }} style={{ height: "30px", paddingLeft: "14px", paddingRight: "14px", borderRadius: "8px", border: "none", backgroundColor: "#3b82f6", color: "white", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
            {ru ? "Оформить подписку" : "Get subscription"}
          </button>
        </div>
      )}

      {messages.length <= 1 && (
        <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "8px", paddingBottom: "2px", flexShrink: 0 }}>
          {quickQuestions.map((q) => (
            <button key={q} onClick={() => sendMessage(q)} style={{ whiteSpace: "nowrap", backgroundColor: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "16px", padding: "5px 10px", fontSize: "11px", color: "#93c5fd", cursor: "pointer", flexShrink: 0 }}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" as any, display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "4px", minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", position: "relative" }}>
              <div style={{ padding: "9px 13px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", backgroundColor: msg.role === "user" ? "#3b82f6" : "rgba(255,255,255,0.07)", border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <p style={{ fontSize: "14px", color: msg.role === "user" ? "white" : "rgba(255,255,255,0.9)", margin: 0, lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {msg.content}
                </p>
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
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.4)", animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: "flex", gap: "6px", alignItems: "flex-end", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isLimited}
          style={{ width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%", backgroundColor: isListening ? "#ef4444" : "rgba(255,255,255,0.08)", border: isListening ? "2px solid #fca5a5" : "none", cursor: isLimited ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: isLimited ? 0.3 : 1 }}
        >
          {isListening ? <MicOff size={16} color="white" /> : <Mic size={16} color="rgba(255,255,255,0.6)" />}
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder={isListening ? (ru ? "Говори..." : "Speaking...") : isLimited ? (ru ? "Лимит..." : "Limit...") : waitingAdvance ? (ru ? "За сколько напомнить?" : "How early?") : pendingTask ? (ru ? "Укажи время..." : "Enter time...") : (ru ? "Напиши задачу или вопрос..." : "Write task or question...")}
          disabled={isLimited}
          rows={1}
          style={{ flex: 1, backgroundColor: isListening ? "rgba(239,68,68,0.1)" : isLimited ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.07)", border: isListening ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "10px 12px", fontSize: "16px", color: isLimited ? "rgba(255,255,255,0.3)" : "white", outline: "none", resize: "none", maxHeight: "70px", overflowY: "auto", boxSizing: "border-box", fontFamily: "inherit" }}
        />

        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading || isLimited}
          style={{ width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%", backgroundColor: input.trim() && !loading && !isLimited ? "#3b82f6" : "rgba(255,255,255,0.08)", border: "none", cursor: input.trim() && !loading && !isLimited ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
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
