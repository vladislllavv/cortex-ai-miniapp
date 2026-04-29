import { useState, useRef, useEffect } from "react";
import {
  useTaskStore,
  checkSubscription,
  getTelegramUserId,
  saveChatHistory,
  loadChatHistory,
} from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { Send, Bot } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

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

  const timeMatch = lower.match(/в\s+(\d{1,2})[:\s](\d{2})?/);
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
    d.setHours(9, 0, 0);
    return d;
  }

  if (lower.includes("сегодня")) {
    const d = new Date(now);
    d.setHours(18, 0, 0);
    return d;
  }

  return null;
}

function detectPriority(inputText: string): "low" | "medium" | "high" {
  const lower = inputText.toLowerCase();
  const highWords = ["срочно", "важно", "критично", "немедленно", "asap", "urgent"];
  const lowWords = ["когда-нибудь", "не срочно", "потом", "maybe", "возможно"];
  if (highWords.some((w) => lower.includes(w))) return "high";
  if (lowWords.some((w) => lower.includes(w))) return "low";
  return "medium";
}

function isTaskCreationIntent(inputText: string): boolean {
  const lower = inputText.toLowerCase();
  const keywords = [
    "напомни", "напоминание", "создай задачу", "добавь задачу",
    "нужно", "надо", "должен", "поставь", "запланируй",
    "через", "сделать", "позвонить", "купить", "встреча",
    "remind", "add task", "create task", "todo", "need to",
  ];
  return keywords.some((k) => lower.includes(k));
}

function extractTaskTitle(inputText: string): string {
  let title = inputText;
  const prefixes = [
    "напомни мне", "напомни", "создай задачу", "добавь задачу",
    "нужно", "надо", "поставь", "запланируй", "сделать",
    "remind me to", "add task", "create task", "i need to",
  ];
  const lower = title.toLowerCase();
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      title = title.slice(prefix.length).trim();
      break;
    }
  }
  title = title
    .replace(/через\s+\d+\s*(минут|час|день|мин|ч)/gi, "")
    .replace(/в\s+\d{1,2}[:\s]\d{2}/gi, "")
    .replace(/завтра|сегодня|утром|вечером/gi, "")
    .trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

interface AIResult {
  responseText: string;
  task: { title: string; dueDate?: string; priority: string } | null;
}

function generateAIResponse(
  userText: string,
  tasks: any[],
  language: string
): AIResult {
  const ru = language === "ru";
  const lower = userText.toLowerCase();
  const activeTasks = tasks.filter((t) => t.status !== "done");

  if (isTaskCreationIntent(userText)) {
    const dueDate = parseTimeFromText(userText);
    const priority = detectPriority(userText);
    const title = extractTaskTitle(userText);

    if (title.length > 2) {
      const timeStr = dueDate
        ? dueDate.toLocaleString(ru ? "ru-RU" : "en-US", {
            hour: "2-digit",
            minute: "2-digit",
            day: "numeric",
            month: "short",
          })
        : ru ? "без времени" : "no time set";

      return {
        responseText: ru
          ? `✅ Задача создана!\n\n📌 ${title}\n⏰ ${timeStr}\n🎯 Приоритет: ${priority === "high" ? "высокий" : priority === "low" ? "низкий" : "средний"}\n\nЯ добавил её в твой список!`
          : `✅ Task created!\n\n📌 ${title}\n⏰ ${timeStr}\n🎯 Priority: ${priority}\n\nAdded to your list!`,
        task: { title, dueDate: dueDate?.toISOString(), priority },
      };
    }
  }

  if (lower.includes("оптимиз") || lower.includes("optimize") || lower.includes("задач")) {
    if (activeTasks.length === 0) {
      return {
        responseText: ru
          ? "У тебя нет активных задач! 🎉 Отличное время чтобы отдохнуть или запланировать что-то новое."
          : "You have no active tasks! 🎉 Great time to rest or plan something new.",
        task: null,
      };
    }
    const highPriority = activeTasks.filter((t) => t.priority === "high");
    return {
      responseText: ru
        ? `📊 Анализ твоих задач:\n\n• Всего активных: ${activeTasks.length}\n• Высокий приоритет: ${highPriority.length}\n\n💡 Совет: ${
            highPriority.length > 0
              ? `Начни с "${highPriority[0].title}" — это самое важное!`
              : `Начни с "${activeTasks[0].title}" — первая в списке.`
          }\n\n🎯 Фокусируйся на одной задаче за раз.`
        : `📊 Task analysis:\n\n• Active: ${activeTasks.length}\n• High priority: ${highPriority.length}\n\n💡 Tip: ${
            highPriority.length > 0
              ? `Start with "${highPriority[0].title}" — most important!`
              : `Start with "${activeTasks[0].title}" — first in list.`
          }\n\n🎯 Focus on one task at a time.`,
      task: null,
    };
  }

  if (lower.includes("начать") || lower.includes("start") || lower.includes("с чего")) {
    if (activeTasks.length === 0) {
      return {
        responseText: ru
          ? "Список задач пуст! 🎉 Добавь первую задачу нажав + внизу."
          : "Task list is empty! 🎉 Add first task by pressing + below.",
        task: null,
      };
    }
    const first = activeTasks.find((t) => t.priority === "high") || activeTasks[0];
    return {
      responseText: ru
        ? `🚀 Начни с этого:\n\n📌 "${first.title}"\n\n✨ Правило 2 минут: если задача займёт меньше 2 минут — сделай прямо сейчас!\n\n💪 Ты справишься!`
        : `🚀 Start with this:\n\n📌 "${first.title}"\n\n✨ 2-minute rule: if it takes less than 2 minutes — do it right now!\n\n💪 You got this!`,
      task: null,
    };
  }

  if (
    lower.includes("стресс") || lower.includes("stress") ||
    lower.includes("устал") || lower.includes("tired") ||
    lower.includes("тревог") || lower.includes("anxiety")
  ) {
    const tips = ru
      ? [
          "🧘 Техника 4-7-8:\n\nВдох 4 сек → задержка 7 сек → выдох 8 сек.\n\nПовтори 3 раза. Мгновенно снижает тревогу! ✨",
          "🌿 Метод «5-4-3-2-1»:\n\nНазови:\n• 5 вещей которые видишь\n• 4 которые можешь потрогать\n• 3 которые слышишь\n• 2 которые чувствуешь\n• 1 которое можешь попробовать\n\nВозвращает в момент здесь и сейчас 🙏",
          "💆 Разбей большую задачу:\n\nВозьми самую страшную задачу и раздели на 3 маленьких шага.\n\nПервый шаг — не больше 5 минут. Начни прямо сейчас! 🚀",
        ]
      : [
          "🧘 4-7-8 Technique:\n\nInhale 4s → Hold 7s → Exhale 8s.\n\nRepeat 3 times. Instantly reduces anxiety! ✨",
          "🌿 5-4-3-2-1 Method:\n\nName:\n• 5 things you see\n• 4 you can touch\n• 3 you hear\n• 2 you smell\n• 1 you can taste\n\nBrings you to the present 🙏",
          "💆 Break it down:\n\nTake your scariest task and split into 3 small steps.\n\nFirst step — no more than 5 minutes. Start now! 🚀",
        ];
    return {
      responseText: tips[Math.floor(Math.random() * tips.length)],
      task: null,
    };
  }

  if (
    lower.includes("мотив") || lower.includes("motivat") ||
    lower.includes("лень") || lower.includes("lazy")
  ) {
    return {
      responseText: ru
        ? "💪 Правило 5 секунд:\n\nКогда не хочется — считай 5-4-3-2-1 и начинай!\n\nМозг не успеет придумать отговорку.\n\n🎯 Действие создаёт мотивацию, а не наоборот!"
        : "💪 5-Second Rule:\n\nWhen you don't feel like it — count 5-4-3-2-1 and start!\n\nYour brain won't have time for excuses.\n\n🎯 Action creates motivation, not the other way around!",
      task: null,
    };
  }

  if (
    lower.includes("продуктив") || lower.includes("productive") ||
    lower.includes("эффектив") || lower.includes("efficient")
  ) {
    return {
      responseText: ru
        ? "⚡ Техника Помодоро:\n\n• 25 минут фокусной работы\n• 5 минут отдыха\n• После 4 циклов — 30 минут отдыха\n\nУвеличивает продуктивность на 40%! 🎯"
        : "⚡ Pomodoro Technique:\n\n• 25 minutes focused work\n• 5 minutes rest\n• After 4 cycles — 30 minutes break\n\nIncreases productivity by 40%! 🎯",
      task: null,
    };
  }

  if (
    lower.includes("сколько") || lower.includes("how many") ||
    lower.includes("статистик") || lower.includes("stats")
  ) {
    const done = tasks.filter((t) => t.status === "done").length;
    return {
      responseText: ru
        ? `📊 Твоя статистика:\n\n✅ Выполнено: ${done}\n📋 Активных: ${activeTasks.length}\n📁 Всего: ${tasks.length}\n\n${done > 0 ? `🎉 Отличная работа! Ты выполнил ${done} задач!` : "💪 Начни выполнять задачи!"}`
        : `📊 Your stats:\n\n✅ Done: ${done}\n📋 Active: ${activeTasks.length}\n📁 Total: ${tasks.length}\n\n${done > 0 ? `🎉 Great job! ${done} tasks completed!` : "💪 Start completing tasks!"}`,
      task: null,
    };
  }

  if (
    lower.includes("привет") || lower.includes("hello") ||
    lower.includes("hi") || lower.includes("хай")
  ) {
    return {
      responseText: ru
        ? `Привет! 👋 Я готов помочь!\n\nЧто умею:\n• Создавать задачи: "через 30 минут позвонить"\n• Анализировать список дел\n• Советы по продуктивности\n• Помощь со стрессом 🧘`
        : `Hello! 👋 Ready to help!\n\nWhat I can do:\n• Create tasks: "call in 30 minutes"\n• Analyze your todo list\n• Productivity tips\n• Stress relief 🧘`,
      task: null,
    };
  }

  if (lower.includes("помог") || lower.includes("help") || lower.includes("умеешь")) {
    return {
      responseText: ru
        ? `🤖 Мои возможности:\n\n📌 Создание задач:\n"через 1 час позвонить маме"\n"завтра купить продукты"\n\n📊 Анализ:\n"оптимизируй мои задачи"\n"с чего начать?"\n\n🧘 Поддержка:\n"я в стрессе"\n"нет мотивации"\n\n📈 Статистика:\n"сколько задач?"`
        : `🤖 My capabilities:\n\n📌 Task creation:\n"call mom in 1 hour"\n"buy groceries tomorrow"\n\n📊 Analysis:\n"optimize my tasks"\n"where to start?"\n\n🧘 Support:\n"I'm stressed"\n"no motivation"\n\n📈 Stats:\n"how many tasks?"`,
      task: null,
    };
  }

  const defaultResponses = ru
    ? [
        "Понял! 🤔 Попробуй написать задачу: \"через 1 час позвонить\" — создам автоматически!",
        "Интересно! 💭 Могу создать задачу, оптимизировать список или дать совет. Что нужно?",
        "Не совсем понял 🤖 Попробуй: \"через 30 минут встреча\" или \"как снизить стресс?\"",
      ]
    : [
        "Got it! 🤔 Try: \"call in 1 hour\" — I'll create the task automatically!",
        "Interesting! 💭 I can create tasks, optimize list or give advice. What do you need?",
        "Not sure I understood 🤖 Try: \"meeting in 30 minutes\" or \"how to reduce stress?\"",
      ];

  return {
    responseText: defaultResponses[Math.floor(Math.random() * defaultResponses.length)],
    task: null,
  };
}

const DEFAULT_MESSAGE = (ru: boolean): Message => ({
  role: "assistant",
  content: ru
    ? "Привет! 👋 Я твой AI ассистент.\n\nМогу помочь:\n• Создать задачу 🎯 — напиши \"через 30 минут позвонить\"\n• Оптимизировать список дел 📋\n• Снизить стресс 🧘\n• Советы по продуктивности ⚡\n\nЧто нужно?"
    : "Hi! 👋 I'm your AI assistant.\n\nI can help:\n• Create tasks 🎯 — write \"call in 30 minutes\"\n• Optimize your todo list 📋\n• Reduce stress 🧘\n• Productivity tips ⚡\n\nWhat do you need?",
});

export default function AiProcessPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const addTask = useTaskStore((state) => state.addTask);
  const ru = language === "ru";

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadChatHistory();
    if (saved.length > 0) return saved as Message[];
    return [DEFAULT_MESSAGE(ru)];
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [aiUsageCount, setAiUsageCount] = useState(() => {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(`ai-usage-${today}`);
    return stored ? parseInt(stored) : 0;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  const quickQuestions = ru
    ? ["через 1 час позвонить", "оптимизируй задачи", "я в стрессе", "с чего начать?"]
    : ["call in 1 hour", "optimize tasks", "I'm stressed", "where to start?"];

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    if (!hasSubscription && aiUsageCount >= AI_FREE_LIMIT) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(
        ru
          ? `Лимит ${AI_FREE_LIMIT} запросов исчерпан 🤖\n\nОформи подписку (100 Stars/мес).\n\nНапиши боту /subscribe`
          : `AI limit of ${AI_FREE_LIMIT} requests reached.\n\nGet subscription.\n\nSend /subscribe to bot`
      );
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

    await new Promise((resolve) => setTimeout(resolve, 600));

    const { responseText, task } = generateAIResponse(messageText, tasks, language);

    if (task && task.title) {
      await addTask({
        title: task.title,
        dueDate: task.dueDate,
        priority: task.priority as any,
        status: "todo",
        isAiCreated: true,
        repeat: "none",
      });
    }

    setMessages((prev) => [...prev, { role: "assistant", content: responseText }]);
    setLoading(false);
  };

  const isLimited = !hasSubscription && aiUsageCount >= AI_FREE_LIMIT;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 160px)",
        minHeight: "400px",
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "12px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "12px",
            backgroundColor: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Bot size={22} color="#3b82f6" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "17px", fontWeight: 700, color: "white", margin: 0 }}>
            AI {ru ? "Ассистент" : "Assistant"}
          </p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {hasSubscription
              ? ru ? "Подписка активна ✅" : "Subscription active ✅"
              : ru
              ? `${AI_FREE_LIMIT - aiUsageCount} запросов осталось`
              : `${AI_FREE_LIMIT - aiUsageCount} requests left`}
          </p>
        </div>
      </div>

      {/* Лимит */}
      {isLimited && (
        <div
          style={{
            backgroundColor: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "12px",
            padding: "12px",
            marginBottom: "10px",
            flexShrink: 0,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "13px", color: "#fca5a5", margin: 0 }}>
            {ru
              ? "Лимит исчерпан 🤖\nОформи подписку для продолжения"
              : "Limit reached 🤖\nGet subscription to continue"}
          </p>
        </div>
      )}

      {/* Быстрые вопросы */}
      {messages.length <= 1 && (
        <div
          style={{
            display: "flex",
            gap: "6px",
            overflowX: "auto",
            marginBottom: "10px",
            paddingBottom: "4px",
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
                borderRadius: "18px",
                padding: "6px 12px",
                fontSize: "12px",
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

      {/* Сообщения */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
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
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius:
                  msg.role === "user"
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                backgroundColor:
                  msg.role === "user" ? "#3b82f6" : "rgba(255,255,255,0.07)",
                border:
                  msg.role === "assistant"
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "none",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  color: msg.role === "user" ? "white" : "rgba(255,255,255,0.9)",
                  margin: 0,
                  lineHeight: "1.55",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {msg.content}
              </p>
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
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div style={{ display: "flex", gap: "3px" }}>
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
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Поле ввода */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "flex-end",
          paddingTop: "8px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
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
            isLimited
              ? ru ? "Лимит исчерпан..." : "Limit reached..."
              : ru ? "Напиши задачу или вопрос..." : "Write a task or question..."
          }
          disabled={isLimited}
          rows={1}
          style={{
            flex: 1,
            backgroundColor: isLimited
              ? "rgba(255,255,255,0.03)"
              : "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            padding: "10px 12px",
            fontSize: "14px",
            color: isLimited ? "rgba(255,255,255,0.3)" : "white",
            outline: "none",
            resize: "none",
            maxHeight: "80px",
            overflowY: "auto",
            boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading || isLimited}
          style={{
            width: "42px",
            height: "42px",
            minWidth: "42px",
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
          <Send size={16} color="white" />
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
