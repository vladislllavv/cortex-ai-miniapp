import { useState, useRef, useEffect } from "react";
import { Search, X, Tag, Clock, CheckCircle } from "lucide-react";
import { useTaskStore, Task } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";

interface Props {
  onSelectTask?: (task: Task) => void;
}

function formatDate(iso: string, ru: boolean) {
  try {
    return new Date(iso).toLocaleDateString(ru ? "ru-RU" : "en-US", {
      day: "numeric", month: "short",
    });
  } catch { return ""; }
}

export default function SearchBar({ onSelectTask }: Props) {
  const tasks = useTaskStore((s) => s.tasks);
  const toggleTaskStatus = useTaskStore((s) => s.toggleTaskStatus);
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";

  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Collect all unique tags
  const allTags = Array.from(new Set(tasks.flatMap((t) => t.tags || []))).slice(0, 10);

  // Filter tasks
  const q = query.trim().toLowerCase();
  const results = tasks.filter((t) => {
    const matchQ = !q || t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || (t.tags || []).some((tag) => tag.toLowerCase().includes(q));
    const matchTag = !filterTag || (t.tags || []).includes(filterTag);
    return matchQ && matchTag;
  }).slice(0, 12);

  const priorityColor = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "10px 14px",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, cursor: "pointer",
          marginBottom: 14, fontFamily: "inherit",
          transition: "all 0.18s",
        }}
      >
        <Search size={15} color="rgba(255,255,255,0.35)" />
        <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", flex: 1, textAlign: "left" }}>
          {ru ? "Поиск задач..." : "Search tasks..."}
        </span>
        {allTags.length > 0 && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.07)", borderRadius: 8, padding: "2px 6px" }}>
            {allTags.length} {ru ? "тегов" : "tags"}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      display: "flex", flexDirection: "column",
      padding: "12px 16px",
    }} onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setQuery(""); setFilterTag(null); } }}>

      {/* Search input */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.09)", border: `1px solid ${theme.primary}40`, borderRadius: 16, padding: "10px 14px", marginBottom: 12 }}>
        <Search size={16} color={theme.primary} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={ru ? "Поиск по задачам, тегам..." : "Search tasks, tags..."}
          style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 15, color: "#fff", fontFamily: "inherit" }}
        />
        <button onClick={() => { setOpen(false); setQuery(""); setFilterTag(null); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
          <X size={18} color="rgba(255,255,255,0.5)" />
        </button>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 12, paddingBottom: 2 }}>
          {allTags.map((tag) => (
            <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)} style={{
              whiteSpace: "nowrap", padding: "5px 12px", borderRadius: 20,
              border: `1px solid ${filterTag === tag ? theme.primary : "rgba(255,255,255,0.12)"}`,
              background: filterTag === tag ? `${theme.primary}20` : "rgba(255,255,255,0.05)",
              color: filterTag === tag ? theme.primary : "rgba(255,255,255,0.55)",
              fontSize: 12, fontWeight: filterTag === tag ? 600 : 400,
              cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <Tag size={10} />#{tag}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {results.length === 0 && (q || filterTag) && (
          <div style={{ textAlign: "center", padding: "30px 20px" }}>
            <p style={{ fontSize: 32, margin: "0 0 8px 0" }}>🔍</p>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? "Ничего не найдено" : "Nothing found"}</p>
          </div>
        )}

        {results.length === 0 && !q && !filterTag && (
          <div style={{ padding: "10px 0" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 8px 0" }}>
              {ru ? "Последние задачи" : "Recent tasks"}
            </p>
            {tasks.filter((t) => t.status !== "done").slice(0, 6).map((task) => (
              <ResultItem key={task.id} task={task} ru={ru} priorityColor={priorityColor} onToggle={() => toggleTaskStatus(task.id)} onClick={() => { onSelectTask?.(task); setOpen(false); setQuery(""); }} />
            ))}
          </div>
        )}

        {results.length > 0 && results.map((task) => (
          <ResultItem key={task.id} task={task} ru={ru} priorityColor={priorityColor} onToggle={() => toggleTaskStatus(task.id)} onClick={() => { onSelectTask?.(task); setOpen(false); setQuery(""); }} highlight={q} />
        ))}
      </div>
    </div>
  );
}

function ResultItem({ task, ru, priorityColor, onToggle, onClick, highlight }: {
  task: Task; ru: boolean; priorityColor: Record<string, string>;
  onToggle: () => void; onClick: () => void; highlight?: string;
}) {
  const isDone = task.status === "done";
  const pColor = priorityColor[task.priority] || "#94a3b8";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 14, marginBottom: 6,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
      cursor: "pointer",
    }} onClick={onClick}>
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{
        width: 22, height: 22, minWidth: 22, borderRadius: 7,
        border: isDone ? "none" : `2px solid ${pColor}50`,
        background: isDone ? pColor : "transparent",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isDone && <CheckCircle size={12} color="#fff" />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: isDone ? "rgba(255,255,255,0.4)" : "#fff", margin: 0, textDecoration: isDone ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
          {task.dueDate && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 3 }}>
              <Clock size={9} />
              {new Date(task.dueDate).toLocaleDateString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "short" })}
            </span>
          )}
          {(task.tags || []).map((tag) => (
            <span key={tag} style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.07)", borderRadius: 6, padding: "1px 5px" }}>#{tag}</span>
          ))}
        </div>
      </div>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: pColor, flexShrink: 0 }} />
    </div>
  );
}
