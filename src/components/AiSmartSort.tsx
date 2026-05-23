import { useState } from "react";
import { Sparkles, Loader, CheckCircle, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18nStore } from "@/lib/i18n";
import { useTaskStore, Task } from "@/lib/store";
import { getAccentGradient } from "@/lib/theme";

const AI_WORKER_URL = "https://ancient-river-8a20.bubo-buboff.workers.dev";

interface SortResult {
  id: string;
  priority: "low" | "medium" | "high";
  sortOrder: number;
  reason: string;
}

export default function AiSmartSort() {
  const { theme } = useTheme();
  const language = useI18nStore((s) => s.language);
  const tasks = useTaskStore((s) => s.tasks);
  const updateTask = useTaskStore((s) => s.updateTask);
  const ru = language === "ru";
  const gradient = getAccentGradient(theme);

  const [loading,  setLoading]  = useState(false);
  const [results,  setResults]  = useState<SortResult[] | null>(null);
  const [applied,  setApplied]  = useState(false);
  const [error,    setError]    = useState("");
  const [showPanel, setShowPanel] = useState(false);

  const activeTasks = tasks.filter((t) => t.status !== "done");

  const runSmartSort = async () => {
    if (activeTasks.length === 0 || loading) return;
    setLoading(true); setError(""); setResults(null); setApplied(false);

    const now = new Date();
    const taskList = activeTasks.slice(0, 20).map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate || null,
      tags: t.tags || [],
      repeat: t.repeat,
      isAiCreated: t.isAiCreated,
    }));

    const systemPrompt = `Ты эксперт по тайм-менеджменту. Проанализируй список задач и расставь их по приоритету.
Текущее время: ${now.toLocaleString("ru-RU")}.
Учитывай: дедлайн (чем ближе — тем важнее), тип задачи, повторяемость, теги.

Верни ТОЛЬКО JSON массив (без пояснений):
[{"id":"...","priority":"high|medium|low","sortOrder":1,"reason":"краткое обоснование"}]

Правила:
- sortOrder начинается с 1 (1 = самая важная)
- Просроченные или дедлайн сегодня → всегда high
- Повторяющиеся задачи без дедлайна → low
- reason = 1 фраза, ${ru ? "по-русски" : "in English"}`;

    try {
      const res = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          messages: [{ role: "user", content: JSON.stringify(taskList) }],
        }),
      });

      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const content: string = data.content || "";

      const match = content.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No JSON found");
      const parsed: SortResult[] = JSON.parse(match[0]);

      // Validate
      const valid = parsed.filter((r) => r.id && r.priority && typeof r.sortOrder === "number");
      if (valid.length === 0) throw new Error("Empty result");

      setResults(valid);
    } catch (e: any) {
      setError(ru ? "Ошибка анализа. Попробуй ещё раз." : "Analysis failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const applySort = () => {
    if (!results) return;
    results.forEach((r) => {
      updateTask(r.id, { priority: r.priority, sortOrder: r.sortOrder });
    });
    setApplied(true);
    setTimeout(() => { setShowPanel(false); setResults(null); setApplied(false); }, 1500);
  };

  if (!showPanel) {
    return (
      <button onClick={() => setShowPanel(true)} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderRadius: 14, width: "100%",
        background: `${theme.primary}10`, border: `1px solid ${theme.primary}25`,
        cursor: "pointer", fontFamily: "inherit", transition: "all 0.18s",
        marginBottom: 14,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: gradient, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Sparkles size={14} color="#fff" />
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: theme.primary, margin: 0 }}>
            {ru ? "AI Smart Sort" : "AI Smart Sort"}
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {ru ? `Расставить приоритеты (${activeTasks.length} задач)` : `Prioritize ${activeTasks.length} tasks`}
          </p>
        </div>
        <Sparkles size={14} color={theme.primary} />
      </button>
    );
  }

  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.primary}30`, borderRadius: 18, padding: 16, marginBottom: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: gradient, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={16} color="#fff" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>AI Smart Sort</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>
              {ru ? "Умная расстановка приоритетов через Groq AI" : "Smart prioritization via Groq AI"}
            </p>
          </div>
        </div>
        <button onClick={() => setShowPanel(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <X size={18} color="rgba(255,255,255,0.4)" />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.1)", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: "#fca5a5", margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Results preview */}
      {results && !applied && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: "0.6px" }}>
            {ru ? "Предлагаемые изменения" : "Suggested changes"}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {results.slice(0, 10).map((r) => {
              const task = activeTasks.find((t) => t.id === r.id);
              if (!task) return null;
              const pColor = r.priority === "high" ? "#ef4444" : r.priority === "medium" ? "#f59e0b" : "#22c55e";
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: pColor, background: `${pColor}18`, borderRadius: 5, padding: "2px 6px", flexShrink: 0, letterSpacing: "0.3px" }}>
                    {r.priority.toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: "#fff", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</p>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: 0 }}>{r.reason}</p>
                  </div>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>#{r.sortOrder}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Applied */}
      {applied && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(34,197,94,0.1)", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
          <CheckCircle size={18} color="#22c55e" />
          <p style={{ fontSize: 13, color: "#86efac", margin: 0, fontWeight: 600 }}>
            {ru ? "Приоритеты обновлены!" : "Priorities updated!"}
          </p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        {!results && !applied && (
          <button onClick={runSmartSort} disabled={loading || activeTasks.length === 0} style={{
            flex: 1, height: 44, borderRadius: 12, border: "none",
            background: loading ? "rgba(255,255,255,0.1)" : gradient,
            color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: loading || activeTasks.length === 0 ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit",
          }}>
            {loading
              ? <><Loader size={16} style={{ animation: "spin 1s linear infinite" }} />{ru ? "Анализирую..." : "Analyzing..."}</>
              : <><Sparkles size={16} />{ru ? "Анализировать" : "Analyze"}</>}
          </button>
        )}
        {results && !applied && (
          <>
            <button onClick={() => { setResults(null); }} style={{ height: 44, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {ru ? "Отмена" : "Cancel"}
            </button>
            <button onClick={applySort} style={{
              flex: 1, height: 44, borderRadius: 12, border: "none",
              background: gradient, color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit",
            }}>
              <CheckCircle size={16} />{ru ? "Применить" : "Apply"}
            </button>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
