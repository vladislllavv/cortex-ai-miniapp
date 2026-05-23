import { memo, useState } from "react";
import { useTaskStore, Task } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { triggerHaptic } from "@/lib/telegram";
import { Trash2, Clock, Repeat2, ChevronDown, ChevronUp, ShoppingCart, Edit2, Check, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

function formatDT(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
    const time = d.toLocaleTimeString(lang === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return lang === "ru" ? `Сегодня ${time}` : `Today ${time}`;
    if (d.toDateString() === tmr.toDateString()) return lang === "ru" ? `Завтра ${time}` : `Tomorrow ${time}`;
    return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" }) + " " + time;
  } catch { return ""; }
}

function dateColor(iso: string): string {
  try {
    const d = new Date(iso), now = new Date();
    const diff = d.getTime() - now.getTime();
    if (diff < 0) return "#ef4444";
    if (diff < 2 * 3600000) return "#f59e0b";
    if (d.toDateString() === now.toDateString()) return "#60a5fa";
    return "rgba(255,255,255,0.35)";
  } catch { return "rgba(255,255,255,0.35)"; }
}

const PRIORITY_CONFIG = {
  high:   { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  label: "🔴" },
  medium: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "🟡" },
  low:    { color: "#22c55e", bg: "rgba(34,197,94,0.12)",  label: "🟢" },
};

export default memo(function TaskCard({ task }: { task: Task }) {
  const lang = useI18nStore((s) => s.language);
  const { toggleTaskStatus, deleteTask, updateTask } = useTaskStore();
  const { theme } = useTheme();
  const [showItems,     setShowItems]     = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const ru = lang === "ru";

  const isDone    = task.status === "done";
  const isShopping = task.type === "shopping";
  const pCfg      = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const timeStr   = task.dueDate && !isDone ? formatDT(task.dueDate, lang) : "";
  const dColor    = task.dueDate && !isDone ? dateColor(task.dueDate) : "rgba(255,255,255,0.3)";
  const items: string[] = task.items?.length ? task.items : task.description ? task.description.split("\n").filter(Boolean) : [];

  const toggle = () => { triggerHaptic(); toggleTaskStatus(task.id); };

  const reschedule = () => {
    if (!newDate) return;
    const iso = newTime ? `${newDate}T${newTime}:00` : `${newDate}T09:00:00`;
    updateTask(task.id, { dueDate: iso });
    setShowReschedule(false); setNewDate(""); setNewTime("");
  };

  return (
    <div style={{
      background: isDone ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
      border: isDone ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "12px 14px",
      opacity: isDone ? 0.6 : 1,
      transition: "all 0.18s",
      animation: "fadeUp 0.2s ease both",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Checkbox */}
        <button onClick={toggle} style={{
          width: 24, height: 24, minWidth: 24, borderRadius: 8, flexShrink: 0, marginTop: 1,
          border: isDone ? "none" : `2px solid ${pCfg.color}40`,
          background: isDone ? pCfg.color : "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.18s",
        }}>
          {isDone && <Check size={13} color="#fff" strokeWidth={3} />}
        </button>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
            {isShopping && <ShoppingCart size={13} color="rgba(255,255,255,0.4)" style={{ marginTop: 2, flexShrink: 0 }} />}
            <p style={{
              fontSize: 14, fontWeight: 500, color: isDone ? "rgba(255,255,255,0.4)" : "#fff",
              margin: 0, textDecoration: isDone ? "line-through" : "none",
              wordBreak: "break-word", lineHeight: 1.4,
            }}>{task.title}</p>
          </div>

          {/* Meta row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {/* Priority badge */}
            <span style={{ fontSize: 10, fontWeight: 600, color: pCfg.color, background: pCfg.bg, borderRadius: 6, padding: "2px 7px", letterSpacing: "0.3px" }}>
              {task.priority.toUpperCase()}
            </span>

            {/* Date */}
            {timeStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={11} color={dColor} />
                <span style={{ fontSize: 11, color: dColor, fontWeight: 500 }}>{timeStr}</span>
              </div>
            )}

            {/* Repeat */}
            {task.repeat && task.repeat !== "none" && (
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Repeat2 size={11} color="rgba(255,255,255,0.3)" />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                  {task.repeat === "daily" ? (ru ? "каждый день" : "daily") : task.repeat === "weekdays" ? "Пн–Пт" : task.repeat === "weekends" ? "Сб–Вс" : task.repeat}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0, marginTop: -2 }}>
          {!isDone && (
            <button onClick={() => setShowReschedule(!showReschedule)} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Edit2 size={12} color="rgba(255,255,255,0.4)" />
            </button>
          )}
          {isShopping && items.length > 0 && (
            <button onClick={() => setShowItems(!showItems)} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {showItems ? <ChevronUp size={12} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={12} color="rgba(255,255,255,0.4)" />}
            </button>
          )}
          <button onClick={() => { triggerHaptic(); deleteTask(task.id); }} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trash2 size={12} color="rgba(239,68,68,0.6)" />
          </button>
        </div>
      </div>

      {/* Shopping items */}
      {isShopping && showItems && items.length > 0 && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: theme.primary, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Reschedule panel */}
      {showReschedule && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)" }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 8px 0", fontWeight: 600 }}>{ru ? "Перенести задачу" : "Reschedule"}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 10px", fontSize: 13, fontFamily: "inherit" }} />
            <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: 90, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 8px", fontSize: 13, fontFamily: "inherit" }} />
            <button onClick={reschedule} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>OK</button>
            <button onClick={() => setShowReschedule(false)} style={{ height: 34, width: 34, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
