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
        ? "Привет! 👋 Я твой AI ассистент.\n\nЯ вижу твои задачи и могу помочь:\n• Оптимизировать выполнение 🎯\n• Разбить на шаги 📋\n• Снизить стресс 🧘\n\nСпроси что-нибудь!"
        : "Hi! 👋 I'm your AI assistant.\n\nI can help:\n• Optimize tasks 🎯\n• Break into steps 📋\n• Reduce stress 🧘\n\nAsk me anything!",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const quickQuestions = ru
    ? ["Оптимизируй задачи", "С чего начать?", "Снизить стресс", "Разбей на шаги"]
    : ["Optimize tasks", "What to start?", "Reduce stress", "Break into steps"];

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    const userMessage: Message = { role: "user", content: messageText };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const reply = await askGroq(updatedMessages.slice(1), tasksSummary);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: ru
            ? `⚠️ Ошибка: ${err?.message || "Попробуй позже"}`
            : `⚠️ Error: ${err?.message || "Try again later"}`,
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
        height: "calc(100vh - 160px)",
        minHeight: "300px",
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
        <div>
          <p style={{ fontSize: "17px", fontWeight: 700, color: "white", margin: 0 }}>
            AI {ru ? "Ассистент" : "Assistant"}
          </p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {ru ? `${activeTasks.length} активных задач` : `${activeTasks.length} active tasks`}
          </p>
        </div>
      </div>

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
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                backgroundColor: msg.role === "user" ? "#3b82f6" : "rgba(255,255,255,0.07)",
                border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}
            >
              <p
                style={{
                  fontSize: "14px",
                  color: msg.role === "user" ? "white" : "rgba(255,255,255,0.9)",
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
                padding: "10px 14px",
                borderRadius: "16px 16px 16px 4px",
                backgroundColor: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Loader2
                size={14}
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

      {/* Поле ввода — всегда видно */}
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
          placeholder={ru ? "Спроси..." : "Ask..."}
          rows={1}
          style={{
            flex: 1,
            backgroundColor: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            padding: "10px 12px",
            fontSize: "14px",
            color: "white",
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
          disabled={!input.trim() || loading}
          style={{
            width: "42px",
            height: "42px",
            minWidth: "42px",
            borderRadius: "50%",
            backgroundColor: input.trim() && !loading ? "#3b82f6" : "rgba(255,255,255,0.08)",
            border: "none",
            cursor: input.trim() && !loading ? "pointer" : "default",
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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
      `}</style>
    </div>
  );
}
