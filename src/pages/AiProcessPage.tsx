import { useState, useRef, useEffect } from "react";
import { useTaskStore } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { Send, Bot, Loader2 } from "lucide-react";

const DEEPSEEK_API_KEY = "sk-308657bf24c24b9e8ff230c561dd9109";

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function askDeepSeek(messages: Message[], tasks: string): Promise<string> {
  const systemPrompt = `Ты умный AI ассистент планировщика задач CortexAI. 
Ты помогаешь пользователю:
1. Анализировать сложность его задач
2. Давать советы по оптимизации выполнения задач
3. Давать ментальные советы для снижения стресса и повышения продуктивности
4. Разбивать сложные задачи на простые шаги

Текущие задачи пользователя:
${tasks}

Отвечай кратко, по делу, дружелюбно. Используй эмодзи. Максимум 3-4 предложения на ответ.`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "Не удалось получить ответ";
}

export default function AiProcessPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);

  const ru = language === "ru";

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: ru
        ? "Привет! 👋 Я твой AI ассистент. Я вижу твои задачи и могу помочь тебе:\n\n• Оптимизировать их выполнение 🎯\n• Разбить сложные задачи на шаги 📋\n• Дать советы для снижения стресса 🧘\n\nСпроси меня что-нибудь!"
        : "Hi! 👋 I'm your AI assistant. I can see your tasks and help you:\n\n• Optimize their execution 🎯\n• Break complex tasks into steps 📋\n• Give stress relief tips 🧘\n\nAsk me anything!",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const tasksSummary = tasks
    .filter((t) => t.status !== "done")
    .map((t) => `- ${t.title} (приоритет: ${t.priority})`)
    .join("\n") || "Задач пока нет";

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
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    const userMessage: Message = { role: "user", content: messageText };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await askDeepSeek(
        newMessages.filter((m) => m.role !== "assistant" || newMessages.indexOf(m) > 0),
        tasksSummary
      );

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ru
            ? "Произошла ошибка. Попробуй ещё раз 🙏"
            : "An error occurred. Please try again 🙏",
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
          gap: "10px",
          marginBottom: "16px",
          padding: "0 4px",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            backgroundColor: "rgba(59,130,246,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Bot size={20} color="#3b82f6" />
        </div>
        <div>
          <p
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "white",
              margin: 0,
            }}
          >
            AI Ассистент
          </p>
          <p
            style={{
              fontSize: "11px",
              color: "rgba(255,255,255,0.4)",
              margin: 0,
            }}
          >
            {ru ? `${tasks.filter(t => t.status !== "done").length} активных задач` : `${tasks.filter(t => t.status !== "done").length} active tasks`}
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
            marginBottom: "12px",
            paddingBottom: "4px",
          }}
        >
          {quickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              style={{
                whiteSpace: "nowrap",
                backgroundColor: "rgba(59,130,246,0.15)",
                border: "1px solid rgba(59,130,246,0.3)",
                borderRadius: "20px",
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
                padding: "10px 14px",
                borderRadius: msg.role === "user"
                  ? "18px 18px 4px 18px"
                  : "18px 18px 18px 4px",
                backgroundColor: msg.role === "user"
                  ? "#3b82f6"
                  : "rgba(255,255,255,0.08)",
                border: msg.role === "assistant"
                  ? "1px solid rgba(255,255,255,0.08)"
                  : "none",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  color: msg.role === "user"
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
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "18px 18px 18px 4px",
                backgroundColor: "rgba(255,255,255,0.08)",
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
              <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>
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
          paddingTop: "8px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <textarea
          ref={inputRef}
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
            backgroundColor: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "16px",
            padding: "10px 14px",
            fontSize: "14px",
            color: "white",
            outline: "none",
            resize: "none",
            maxHeight: "100px",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        />

        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          style={{
            width: "42px",
            height: "42px",
            minWidth: "42px",
            borderRadius: "50%",
            backgroundColor: input.trim() && !loading ? "#3b82f6" : "rgba(255,255,255,0.1)",
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
      `}</style>
    </div>
  );
}
