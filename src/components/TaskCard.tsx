import { useState } from "react";
import { useTaskStore, Task } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { triggerHaptic } from "@/lib/telegram";
import { Trash2, Clock, RefreshCw, ChevronDown, ChevronUp, ShoppingCart } from "lucide-react";

function formatDateTime(isoString: string, language: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    const now = new Date();
    const todayStr = now.toDateString();
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrowDate.toDateString();
    const timeStr = date.toLocaleTimeString(
      language === "ru" ? "ru-RU" : "en-US",
      { hour: "2-digit", minute: "2-digit" }
    );
    if (date.toDateString() === todayStr) {
      return language === "ru" ? `Сегодня ${timeStr}` : `Today ${timeStr}`;
    }
    if (date.toDateString() === tomorrowStr) {
      return language === "ru" ? `Завтра ${timeStr}` : `Tomorrow ${timeStr}`;
    }
    const dayStr = date.toLocaleDateString(
      language === "ru" ? "ru-RU" : "en-US",
      { day: "numeric", month: "short" }
    );
    return `${dayStr} ${timeStr}`;
  } catch { return ""; }
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
  const { toggleTaskStatus, deleteTask, updateTask } = useTaskStore();
  const [showItems, setShowItems] = useState(false);
  const ru = language === "ru";

  const isDone = task.status === "done";
  const timeStr = task.dueDate ? formatDateTime(task.dueDate, language) : "";
  const isShopping = task.type === "shopping";

  // Получаем items из description если items пустой
  const items: string[] = (task.items && task.items.length > 0)
    ? task.items
    : task.description
      ? task.description.split("\n").filter((i) => i.trim())
      : [];

  // Храним состояние вычеркнутых товаров локально
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const toggleItem = (idx: number) => {
    triggerHaptic("light");
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div
      style={{
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: "14px",
        border: "1px solid rgba(255,255,255,0.07)",
        overflow: "hidden",
        opacity: isDone ? 0.55 : 1,
        transition: "opacity 0.2s ease",
        marginBottom: "2px",
      }}
    >
      {/* Основная строка */}
      <div
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        {/* Чекбокс */}
        <button
          onClick={() => {
            triggerHaptic("light");
            toggleTaskStatus(task.id);
          }}
          style={{
            width: "22px", height: "22px", minWidth: "22px",
            borderRadius: "50%",
            border: `2px solid ${isDone ? "#3b82f6" : isShopping ? "#22c55e" : "rgba(255,255,255,0.25)"}`,
            backgroundColor: isDone ? "#3b82f6" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", marginTop: "1px",
            transition: "all 0.2s ease", flexShrink: 0, padding: 0,
          }}
        >
          {isDone && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {!isDone && isShopping && (
            <ShoppingCart size={11} color="#22c55e" />
          )}
        </button>

        {/* Контент */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: "15px", fontWeight: 500,
              color: isDone ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.92)",
              textDecoration: isDone ? "line-through" : "none",
              margin: "0 0 4px 0", wordBreak: "break-word", lineHeight: "1.4",
              transition: "all 0.2s ease",
            }}
          >
            {task.title}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {timeStr && (
              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <Clock size={11} color="rgba(255,255,255,0.35)" />
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{timeStr}</span>
              </div>
            )}
            {task.repeat === "daily" && (
              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <RefreshCw size={11} color="rgba(255,255,255,0.35)" />
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
                  {ru ? "каждый день" : "daily"}
                </span>
              </div>
            )}
            {isShopping && items.length > 0 && (
              <span style={{ fontSize: "11px", color: "rgba(34,197,94,0.7)" }}>
                {Object.values(checkedItems).filter(Boolean).length}/{items.length} {ru ? "куплено" : "bought"}
              </span>
            )}
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: getPriorityColor(task.priority), flexShrink: 0 }} />
          </div>
        </div>

        {/* Кнопки справа */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
          {/* Раскрыть список покупок */}
          {isShopping && items.length > 0 && (
            <button
              onClick={() => setShowItems(!showItems)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "4px", display: "flex", alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {showItems
                ? <ChevronUp size={16} color="rgba(34,197,94,0.7)" />
                : <ChevronDown size={16} color="rgba(255,255,255,0.4)" />}
            </button>
          )}

          {/* Удалить */}
          <button
            onClick={() => {
              triggerHaptic("light");
              deleteTask(task.id);
            }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "4px", display: "flex", alignItems: "center",
              justifyContent: "center", opacity: 0.35,
              transition: "opacity 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
          >
            <Trash2 size={15} color="#ef4444" />
          </button>
        </div>
      </div>

      {/* Список покупок — раскрывается */}
      {isShopping && showItems && items.length > 0 && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "8px 14px 12px 14px",
          }}
        >
          {items.map((item, idx) => (
            <div
              key={idx}
              onClick={() => toggleItem(idx)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "6px 0",
                cursor: "pointer",
                borderBottom: idx < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              {/* Чекбокс товара */}
              <div
                style={{
                  width: "18px", height: "18px", minWidth: "18px",
                  borderRadius: "50%",
                  border: `2px solid ${checkedItems[idx] ? "#22c55e" : "rgba(255,255,255,0.2)"}`,
                  backgroundColor: checkedItems[idx] ? "#22c55e" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                }}
              >
                {checkedItems[idx] && (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                )}
              </div>

              {/* Название товара */}
              <span
                style={{
                  fontSize: "14px",
                  color: checkedItems[idx] ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)",
                  textDecoration: checkedItems[idx] ? "line-through" : "none",
                  transition: "all 0.15s ease",
                  flex: 1,
                }}
              >
                {item}
              </span>
            </div>
          ))}

          {/* Прогресс */}
          {Object.values(checkedItems).filter(Boolean).length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <div style={{ height: "3px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "2px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(Object.values(checkedItems).filter(Boolean).length / items.length) * 100}%`,
                    backgroundColor: "#22c55e",
                    borderRadius: "2px",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
