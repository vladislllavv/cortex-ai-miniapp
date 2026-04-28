import { useState, useRef, useEffect } from "react";
import { useTaskStore } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { Send, Bot, Loader2 } from "lucide-react";

const GROQ_API_KEY = "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";

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function askGroq(
  messages: Message[],
  tasksSummary: string
): Promise<string> {
  const systemPrompt = `Ты умный AI ассистент планировщика задач CortexAI.
Ты помогаешь пользователю:
1. Анализировать сложность его задач
2. Давать советы по оптимизации выполнения задач
3. Давать ментальные советы для снижения стресса и повышения продуктивности
4. Разбивать сложные задачи на простые шаги

Текущие задачи пользователя:
${tasksSummary}

Отвечай кратко, по делу, дружелюбно. Используй эмодзи. Максимум 3-4 предложения.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 400,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Groq error:", res.status, err);
    throw new Error(`API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return (
    data.choices?.[0]?.message?.content ||
    "Не удалось получить ответ от AI"
  );
}

export default function AiProcessPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const ru = language === "ru";

  const activeTasks = tasks.filter((t) => t.status !== "done");

  const tasksSummary =
    activeTasks.length > 0
      ? activeTasks
          .map((t) => `- ${t.title} (приоритет: ${t.priority})`)
          .join("\n")
      : ru
      ? "Задач пока нет"
      : "No tasks yet";

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: ru
        ? "Привет! 👋 Я твой AI ассистент.\n\nЯ вижу твои задачи и могу помочь:\n• Оптимизировать их выполнение 🎯\n• Разбить сложные задачи на шаги 📋\n• Дать советы для снижения стресса 🧘\n\nСпроси меня что-нибудь!"
        : "Hi! 👋 I'm your AI assistant.\n\nI can see your tasks and help:\n• Optimize execution 🎯\n• Break tasks into steps 📋\n• Reduce stress 🧘\n\nAsk me anything!",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const quickQuestions = ru
    ? [
        "Как оптимизировать мои задачи?",
        "С чего начать сегодня?",
        "Как снизить стресс?",
        "Разбей задачи на шаги",
      ]
    : [
        "How to optimize my tasks?",
        "What to start with today?",
        "How to reduce stress?",
        "Break tasks into steps",
      ];

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    const userMessage: Message = { role: "user", content: messageText };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const reply = await askGroq(
        updatedMessages.slice(1),
        tasksSummary
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);
    } catch (err: any) {
      console.error("AI error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ru
            ? `⚠️ Ошибка подключения к AI.\n\n${err?.message || ""}\n\nПроверь интернет и попробуй ещё раз.`
            : `⚠️ AI connection error.\n\n${err?.message || ""}\n\nCheck internet and try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 80px)",
        paddingTop: "8px",
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "16px",
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
        <div>
          <p
            style={{
              fontSize: "17px",
              fontWeight: 700,
              color: "white",
              margin: 0,
            }}
          >
            AI {ru ? "Ассистент" : "Assistant"}
          </p>
          <p
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.4)",
              margin: 0,
            }}
          >
            {ru
              ? `${activeTasks.length} активных задач`
              : `${activeTasks.length} active tasks`}
          </p>
        </div>
      </div>

      {/* Быстрые вопросы */}
      {messages.length <= 1 && (
        <div
          style={{
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            marginBottom: "14px",
            paddingBottom: "4px",
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
                borderRadius: "20px",
                padding: "7px 14px",
                fontSize: "12px",
                color: "#93c5fd",
                cursor: "pointer",
                flexShrink: 0,
                transition: "all 0.15s ease",
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
          gap: "10px",
          paddingBottom: "12px",
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "11px 15px",
                borderRadius:
                  msg.role === "user"
                    ? "18px 18px 4px 18px"
                    : "18px 18px 18px 4px",
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
                    msg.role === "user"
                      ? "white"
                      : "rgba(255,255,255,0.9)",
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
                padding: "12px 16px",
                borderRadius: "18px 18px 18px 4px",
                backgroundColor: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Loader2
                size={16}
                color="rgba(255,255,255,0.5)"
                style={{ animation: "spin 1s linear infinite" }}
              />
              <span
                style={{
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                {ru ? "Думаю..." : "Thinking..."}
              </span>
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
          paddingTop: "10px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
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
          placeholder={ru ? "Спроси что-нибудь..." : "Ask something..."}
          rows={1}
          style={{
            flex: 1,
            backgroundColor: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "16px",
            padding: "11px 14px",
            fontSize: "14px",
            color: "white",
            outline: "none",
            resize: "none",
            maxHeight: "100px",
            overflowY: "auto",
            boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />

        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          style={{
            width: "44px",
            height: "44px",
            minWidth: "44px",
            borderRadius: "50%",
            backgroundColor:
              input.trim() && !loading
                ? "#3b82f6"
                : "rgba(255,255,255,0.08)",
            border: "none",
            cursor: input.trim() && !loading ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background-color 0.2s ease",
            flexShrink: 0,
          }}
        >
          <Send size={18} color="white" />
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        textarea::placeholder {
          color: rgba(255,255,255,0.3);
        }
      `}</style>
    </div>
  );
}
