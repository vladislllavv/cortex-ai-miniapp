import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, Clock, RefreshCw } from "lucide-react";
import { useTaskStore, Task } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { triggerHaptic } from "@/lib/telegram";

function formatDateTime(isoString: string, language: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const todayStr = now.toDateString();
    const dateStr = date.toDateString();

    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrowDate.toDateString();

    const timeStr = date.toLocaleTimeString(language === "ru" ? "ru-RU" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (dateStr === todayStr) {
      return language === "ru" ? `Сегодня в ${timeStr}` : `Today at ${timeStr}`;
    }

    if (dateStr === tomorrowStr) {
      return language === "ru" ? `Завтра в ${timeStr}` : `Tomorrow at ${timeStr}`;
    }

    const dayStr = date.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", {
      day: "numeric",
      month: "short",
    });

    return `${dayStr} в ${timeStr}`;
  } catch {
    return "";
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "high": return "#ef4444";
    case "medium": return "#f59e0b";
    case "low": return "#22c55e";
    default: return "#94a3b8";
  }
}

export default function TaskCard({ task }: { task: Task }) {
  const language = useI18nStore((state) => state.language);
  const { toggleTaskStatus, deleteTask } = useTaskStore();
  const [showDelete, setShowDelete] = useState(false);

  const isDone = task.status === "done";
  const timeStr = task.dueDate ? formatDateTime(task.dueDate, language) : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      style={{
        backgroundColor: "rgba(255,255,255,0.07)",
        borderRadius: "16px",
        padding: "12px 14px",
        marginBottom: "8px",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        cursor: "pointer",
        position: "relative",
        opacity: isDone ? 0.6 : 1,
        transition: "opacity 0.2s ease",
      }}
      onLongPress={() => setShowDelete(!showDelete)}
      onClick={() => {
        if (showDelete) {
          setShowDelete(false);
          return;
        }
        triggerHaptic("light");
        toggleTaskStatus(task.id);
      }}
    >
      {/* Чекбокс */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic("light");
          toggleTaskStatus(task.id);
        }}
        style={{
          width: "22px",
          height: "22px",
          minWidth: "22px",
          borderRadius: "50%",
          border: `2px solid ${isDone ? "#3b82f6" : "rgba(255,255,255,0.3)"}`,
          backgroundColor: isDone ? "#3b82f6" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: "1px",
          transition: "all 0.2s ease",
          cursor: "pointer",
        }}
      >
        {isDone && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Контент */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Название */}
        <p
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: isDone ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.95)",
            textDecoration: isDone ? "line-through" : "none",
            marginBottom: "4px",
            wordBreak: "break-word",
            transition: "all 0.2s ease",
          }}
        >
          {task.title}
        </p>

        {/* Нижняя строка — время и теги */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          {/* Время */}
          {timeStr && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <Clock
                style={{
                  width: "11px",
                  height: "11px",
                  color: "rgba(255,255,255,0.4)",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                {timeStr}
              </span>
            </div>
          )}

          {/* Повтор */}
          {task.repeat === "daily" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              <RefreshCw
                style={{
                  width: "11px",
                  height: "11px",
                  color: "rgba(255,255,255,0.4)",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                {language === "ru" ? "каждый день" : "daily"}
              </span>
            </div>
          )}

          {/* Приоритет */}
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: getPriorityColor(task.priority),
              flexShrink: 0,
            }}
          />
        </div>
      </div>

      {/* Кнопка удаления */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          triggerHaptic("light");
          deleteTask(task.id);
        }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.4,
          transition: "opacity 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
      >
        <Trash2
          style={{
            width: "15px",
            height: "15px",
            color: "#ef4444",
          }}
        />
      </button>
    </motion.div>
  );
}
