import { memo, useState } from "react";
import { useTaskStore, Task } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { triggerHaptic } from "@/lib/telegram";
import {
  Trash2, Clock, Repeat2, ChevronDown, ChevronUp,
  ShoppingCart, Edit2, Check, X, Tag,
} from "lucide-react";
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

function dColor(iso: string): string {
  try {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return "#ef4444";
    if (diff < 7200000) return "#f59e0b";
    if (new Date(iso).toDateString() === new Date().toDateString()) return "#60a5fa";
    return "rgba(255,255,255,0.35)";
  } catch { return "rgba(255,255,255,0.35)"; }
}

const P_CFG = {
  high:   { color: "#ef4444", bg: "rgba(239,68,68,0.12)",  label: "HIGH"   },
  medium: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "MED"    },
  low:    { color: "#22c55e", bg: "rgba(34,197,94,0.12)",  label: "LOW"    },
};

export default memo(function TaskCard({ task }: { task: Task }) {
  const lang = useI18nStore((s) => s.language);
  const { toggleTaskStatus, deleteTask, updateTask } = useTaskStore();
  const { theme } = useTheme();
  const [showItems,     setShowItems]     = useState(false);
  const [showEdit,      setShowEdit]      = useState(false);
  const [newDate,       setNewDate]       = useState("");
  const [newTime,       setNewTime]       = useState("");
  const [newTitle,      setNewTitle]      = useState(task.title);
  const [newTagInput,   setNewTagInput]   = useState("");
  const ru = lang === "ru";

  const isDone    = task.status === "done";
  const isShopping = task.type === "shopping";
  const pcfg      = P_CFG[task.priority] || P_CFG.medium;
  const timeStr   = task.dueDate && !isDone ? formatDT(task.dueDate, lang) : "";
  const dc        = task.dueDate && !isDone ? dColor(task.dueDate) : "rgba(255,255,255,0.3)";
  const tags      = task.tags || [];
  const items: string[] = task.items?.length ? task.items : task.description ? task.description.split("\n").filter(Boolean) : [];

  const toggle = () => { triggerHaptic(); toggleTaskStatus(task.id); };

  const applyReschedule = () => {
    if (!newDate) return;
    const iso = newTime ? `${newDate}T${newTime}:00` : `${newDate}T09:00:00`;
    updateTask(task.id, { dueDate: iso });
    setShowEdit(false); setNewDate(""); setNewTime("");
  };

  const addTag = () => {
    const tag = newTagInput.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (!tag || tags.includes(tag) || tags.length >= 5) return;
    updateTask(task.id, { tags: [...tags, tag] });
    setNewTagInput("");
  };

  const removeTag = (tag: string) => {
    updateTask(task.id, { tags: tags.filter((t) => t !== tag) });
  };

  const saveTitle = () => {
    if (newTitle.trim() && newTitle.trim() !== task.title) {
      updateTask(task.id, { title: newTitle.trim() });
    }
    setShowEdit(false);
  };

  return (
    <div style={{
      background: isDone ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
      border: isDone ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(255,255,255,0.09)",
      borderRadius: 16, padding: "12px 14px",
      opacity: isDone ? 0.55 : 1,
      transition: "all 0.18s",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        {/* Checkbox */}
        <button onClick={toggle} style={{
          width: 24, height: 24, minWidth: 24, borderRadius: 8, flexShrink: 0, marginTop: 1,
          border: isDone ? "none" : `2px solid ${pcfg.color}45`,
          background: isDone ? pcfg.color : "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.18s",
        }}>
          {isDone && <Check size={13} color="#fff" strokeWidth={3} />}
        </button>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
            {isShopping && <ShoppingCart size={12} color="rgba(255,255,255,0.4)" style={{ marginTop: 2, flexShrink: 0 }} />}
            <p style={{
              fontSize: 14, fontWeight: 500,
              color: isDone ? "rgba(255,255,255,0.35)" : "#fff",
              margin: 0, textDecoration: isDone ? "line-through" : "none",
              wordBreak: "break-word", lineHeight: 1.4,
            }}>{task.title}</p>
          </div>

          {/* Meta */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: pcfg.color, background: pcfg.bg, borderRadius: 5, padding: "2px 6px", letterSpacing: "0.3px" }}>
              {pcfg.label}
            </span>
            {timeStr && (
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={10} color={dc} />
                <span style={{ fontSize: 10, color: dc, fontWeight: 500 }}>{timeStr}</span>
              </div>
            )}
            {task.repeat && task.repeat !== "none" && (
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <Repeat2 size={10} color="rgba(255,255,255,0.3)" />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                  {task.repeat === "daily" ? (ru ? "daily" : "daily") : task.repeat === "weekdays" ? "Пн–Пт" : task.repeat === "weekends" ? "Сб–Вс" : task.repeat}
                </span>
              </div>
            )}
            {/* Tags */}
            {tags.map((tag) => (
              <span key={tag} style={{ fontSize: 9, color: theme.primary, background: `${theme.primary}14`, borderRadius: 6, padding: "2px 6px", cursor: "pointer" }}
                onClick={() => removeTag(tag)}>#{tag}</span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0, marginTop: -2 }}>
          {!isDone && (
            <button onClick={() => { setShowEdit(!showEdit); setNewTitle(task.title); setNewDate(""); setNewTime(""); }} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Edit2 size={12} color="rgba(255,255,255,0.4)" />
            </button>
          )}
          {isShopping && items.length > 0 && (
            <button onClick={() => setShowItems(!showItems)} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {showItems ? <ChevronUp size={12} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={12} color="rgba(255,255,255,0.4)" />}
            </button>
          )}
          <button onClick={() => { triggerHaptic(); deleteTask(task.id); }} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trash2 size={12} color="rgba(239,68,68,0.55)" />
          </button>
        </div>
      </div>

      {/* Shopping items */}
      {isShopping && showItems && items.length > 0 && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 5 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: theme.primary, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Edit panel */}
      {showEdit && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Edit title */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveTitle()}
              style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 10px", fontSize: 13, outline: "none", fontFamily: "inherit" }} />
            <button onClick={saveTitle} style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "none", background: theme.primary, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {ru ? "Сохр." : "Save"}
            </button>
          </div>

          {/* Reschedule */}
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: "0 0 6px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>{ru ? "Перенести" : "Reschedule"}</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 10px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: 86, height: 34, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 8px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            <button onClick={applyReschedule} disabled={!newDate} style={{ height: 34, padding: "0 10px", borderRadius: 8, border: "none", background: newDate ? theme.primary : "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: newDate ? "pointer" : "default" }}>OK</button>
            <button onClick={() => setShowEdit(false)} style={{ height: 34, width: 34, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={13} />
            </button>
          </div>

          {/* Tags */}
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: "0 0 6px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            <Tag size={9} style={{ marginRight: 4 }} />{ru ? "Теги (макс. 5)" : "Tags (max 5)"}
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {tags.map((tag) => (
              <span key={tag} onClick={() => removeTag(tag)} style={{ fontSize: 11, color: theme.primary, background: `${theme.primary}18`, borderRadius: 8, padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                #{tag} <X size={9} />
              </span>
            ))}
          </div>
          {tags.length < 5 && (
            <div style={{ display: "flex", gap: 6 }}>
              <input value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()}
                placeholder={ru ? "#тег" : "#tag"}
                style={{ flex: 1, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "0 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
              <button onClick={addTag} style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "none", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", fontSize: 12, cursor: "pointer" }}>+</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
