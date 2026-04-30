import { useState } from "react";
import { useTaskStore, Task } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { triggerHaptic } from "@/lib/telegram";
import {
  Trash2, Clock, RefreshCw, ChevronDown,
  ChevronUp, ShoppingCart, Edit2, X, Check,
} from "lucide-react";

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
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const ru = language === "ru";

  const isDone = task.status === "done";
  const timeStr = task.dueDate ? formatDateTime(task.dueDate, language) : "";
  const isShopping = task.type === "shopping";

  const items: string[] = (task.items && task.items.length > 0)
    ? task.items
    : task.description
      ? task.description.split("\n").filter((i) => i.trim())
      : [];

  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  const toggleItem = (idx: number) => {
    triggerHaptic("light");
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // БЛОК 6: Перенос задачи
  const handleReschedule = () => {
    if (!newDate) return;
    let dueDate: string;
    if (newTime) {
      const p = new Date(`${newDate}T${newTime}:00`);
      if (!isNaN(p.getTime())) dueDate = p.toISOString();
      else return;
    } else {
      const p = new Date(`${newDate}T09:00:00`);
      if (!isNaN(p.getTime())) dueDate = p.toISOString();
      else return;
    }

    updateTask(task.id, { dueDate });
    triggerHaptic("success");
    setShowReschedule(false);
    setNewDate("");
    setNewTime("");
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
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: "12px" }}>

        {/* Чекбокс */}
        <button
          onClick={() => { triggerHaptic("light"); toggleTaskStatus(task.id); }}
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
              <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          {!isDone && isShopping && <ShoppingCart size={11} color="#22c55e" />}
        </button>

        {/* Контент */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: "15px", fontWeight: 500,
            color: isDone ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.92)",
            textDecoration: isDone ? "line-through" : "none",
            margin: "0 0 4px 0", wordBreak: "break-word", lineHeight: "1.4",
          }}>
            {task.title}
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {timeStr && (
              <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                <Clock size={11} color="rgba(255,255,255,0.35)" />
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{timeStr}</span>
              </div>
            )}

            {/* БЛОК 1: Ежедневная задача без даты */}
            {task.repeat === "daily" && !task.dueDate && (
              <span style={{ fontSize: "11px", color: "rgba(255,165,0,0.7)", display: "flex", alignItems: "center", gap: "3px" }}>
                <RefreshCw size={10} color="rgba(255,165,0,0.7)" />
                {ru ? "ежедневно (нет даты)" : "daily (no date)"}
              </span>
            )}

            {task.repeat === "daily" && task.dueDate && (
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
        <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>

          {/* БЛОК 6: Перенести задачу */}
          {!isDone && (
            <button
              onClick={() => setShowReschedule(!showReschedule)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "4px", display: "flex", alignItems: "center",
                opacity: 0.4, transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
              title={ru ? "Перенести" : "Reschedule"}
            >
              <Edit2 size={14} color="#60a5fa" />
            </button>
          )}

          {/* Раскрыть список покупок */}
          {isShopping && items.length > 0 && (
            <button
              onClick={() => setShowItems(!showItems)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}
            >
              {showItems
                ? <ChevronUp size={16} color="rgba(34,197,94,0.7)" />
                : <ChevronDown size={16} color="rgba(255,255,255,0.4)" />}
            </button>
          )}

          {/* Удалить */}
          <button
            onClick={() => { triggerHaptic("light"); deleteTask(task.id); }}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", opacity: 0.35, transition: "opacity 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
          >
            <Trash2 size={15} color="#ef4444" />
          </button>
        </div>
      </div>

      {/* БЛОК 6: Панель переноса */}
      {showReschedule && (
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "10px 14px",
          backgroundColor: "rgba(59,130,246,0.05)",
        }}>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: "0 0 8px 0" }}>
            {ru ? "Перенести на:" : "Reschedule to:"}
          </p>
          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{
                flex: 1, minWidth: "130px", height: "36px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.07)",
                paddingLeft: "10px", paddingRight: "10px",
                fontSize: "13px", color: "white",
                outline: "none", fontFamily: "inherit",
                colorScheme: "dark",
                boxSizing: "border-box" as const,
              }}
            />
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              style={{
                width: "100px", minWidth: "100px", height: "36px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.07)",
                paddingLeft: "10px", paddingRight: "10px",
                fontSize: "13px", color: "white",
                outline: "none", fontFamily: "inherit",
                colorScheme: "dark",
                boxSizing: "border-box" as const,
              }}
            />
            <button
              onClick={handleReschedule}
              disabled={!newDate}
              style={{
                height: "36px", paddingLeft: "12px", paddingRight: "12px",
                borderRadius: "8px", border: "none",
                backgroundColor: newDate ? "#3b82f6" : "rgba(255,255,255,0.1)",
                color: "white", fontSize: "12px",
                fontWeight: 600, cursor: newDate ? "pointer" : "default",
                flexShrink: 0,
                display: "flex", alignItems: "center", gap: "4px",
              }}
            >
              <Check size={14} />
              {ru ? "OK" : "OK"}
            </button>
            <button
              onClick={() => { setShowReschedule(false); setNewDate(""); setNewTime(""); }}
              style={{ height: "36px", paddingLeft: "10px", paddingRight: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", color: "rgba(255,255,255,0.4)", fontSize: "12px", cursor: "pointer", flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Список покупок */}
      {isShopping && showItems && items.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 14px 12px 14px" }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              onClick={() => toggleItem(idx)}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "6px 0", cursor: "pointer",
                borderBottom: idx < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              <div style={{
                width: "18px", height: "18px", minWidth: "18px",
                borderRadius: "50%",
                border: `2px solid ${checkedItems[idx] ? "#22c55e" : "rgba(255,255,255,0.2)"}`,
                backgroundColor: checkedItems[idx] ? "#22c55e" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s ease", flexShrink: 0,
              }}>
                {checkedItems[idx] && (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <span style={{
                fontSize: "14px",
                color: checkedItems[idx] ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.8)",
                textDecoration: checkedItems[idx] ? "line-through" : "none",
                transition: "all 0.15s ease", flex: 1,
              }}>
                {item}
              </span>
            </div>
          ))}

          {Object.values(checkedItems).filter(Boolean).length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <div style={{ height: "3px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${(Object.values(checkedItems).filter(Boolean).length / items.length) * 100}%`,
                  backgroundColor: "#22c55e", borderRadius: "2px",
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
