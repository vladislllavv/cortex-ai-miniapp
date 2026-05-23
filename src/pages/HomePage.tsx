import { useState, useMemo } from "react";
import TaskCard from "@/components/TaskCard";
import { useTaskStore } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { ChevronRight, ChevronDown, Clock, Repeat2, Flame } from "lucide-react";
import AssignedTasksBanner from "@/components/AssignedTasksBanner";
import { useTeamStore } from "@/lib/teamStore";
import { PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";
import { useTheme } from "@/contexts/ThemeContext";

export default function HomePage() {
  const language = useI18nStore((s) => s.language);
  const tasks = useTaskStore((s) => s.tasks);
  const birthdays = useTaskStore((s) => s.birthdays);
  const vacations = useTaskStore((s) => s.vacations);
  const categories = useTaskStore((s) => s.categories);
  const categoryEvents = useTaskStore((s) => s.categoryEvents);
  const isDataLoaded = useTaskStore((s) => s.isDataLoaded);
  const activeWorkspaceId = useTaskStore((s) => s.activeWorkspaceId);
  const { workspaces } = useTeamStore();
  const { theme } = useTheme();
  const ru = language === "ru";

  const isTeam = activeWorkspaceId !== PERSONAL_WORKSPACE_ID;
  const currentWs = workspaces.find((w) => w.id === activeWorkspaceId);

  const now = new Date();
  const todayStr    = now.toISOString().split("T")[0];
  const tmrDate     = new Date(now); tmrDate.setDate(now.getDate() + 1);
  const tmrStr      = tmrDate.toISOString().split("T")[0];
  const todayMD     = `${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const tmrMD       = `${String(tmrDate.getMonth()+1).padStart(2,"0")}-${String(tmrDate.getDate()).padStart(2,"0")}`;

  const todayBirths = birthdays.filter((b) => b.date === todayMD);
  const tmrBirths   = birthdays.filter((b) => b.date === tmrMD);

  const active  = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const done    = useMemo(() => tasks.filter((t) => t.status === "done"),  [tasks]);
  const withDate = useMemo(() => active.filter((t) => t.dueDate), [active]);

  const todayT    = useMemo(() => withDate.filter((t) => t.dueDate?.startsWith(todayStr)), [withDate, todayStr]);
  const tmrT      = useMemo(() => withDate.filter((t) => t.dueDate?.startsWith(tmrStr)),   [withDate, tmrStr]);
  const overdue   = useMemo(() => withDate.filter((t) => new Date(t.dueDate!) < now && !t.dueDate!.startsWith(todayStr)), [withDate, todayStr]);
  const later     = useMemo(() => withDate.filter((t) => new Date(t.dueDate!) >= now && !t.dueDate!.startsWith(todayStr) && !t.dueDate!.startsWith(tmrStr)), [withDate, todayStr, tmrStr]);
  const noDate    = useMemo(() => active.filter((t) => !t.dueDate && t.repeat !== "daily"), [active]);
  const daily     = useMemo(() => active.filter((t) => t.repeat === "daily" && !t.dueDate), [active]);

  const [showDone,    setShowDone]    = useState(false);
  const [showNoDate,  setShowNoDate]  = useState(true);
  const [showOverdue, setShowOverdue] = useState(true);
  const [activeSection, setActiveSection] = useState<string|null>(null);

  const sectionData = useMemo(() => {
    if (!activeSection) return null;
    if (activeSection === "birthdays") return birthdays.map((b) => ({ id: b.id, title: b.name, sub: b.date, color: b.color, icon: "🎂" }));
    if (activeSection === "vacations") return vacations.map((v) => ({ id: v.id, title: v.title, sub: `${v.startDate} — ${v.endDate}`, color: v.color, icon: "🌴" }));
    return categoryEvents.filter((e) => e.categoryId === activeSection).map((e) => {
      const cat = categories.find((c) => c.id === e.categoryId);
      return { id: e.id, title: e.title, sub: e.endDate ? `${e.date} — ${e.endDate}` : e.date, color: e.color || cat?.color || theme.primary, icon: cat?.icon || "📁" };
    });
  }, [activeSection, birthdays, vacations, categoryEvents, categories, theme]);

  const greeting = () => {
    const h = now.getHours();
    if (ru) return h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  };

  const dateStr = now.toLocaleDateString(ru ? "ru-RU" : "en-US", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ paddingTop: 4 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 2px 0", textTransform: "capitalize" }}>{dateStr}</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.5px" }}>{greeting()} 👋</h1>
      </div>

      <AssignedTasksBanner />

      {/* ── Team badge ── */}
      {isTeam && currentWs && (
        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>👥</span>
          <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600 }}>{currentWs.name}</span>
        </div>
      )}

      {/* ── Loading ── */}
      {!isDataLoaded && (
        <div style={{ background: `${theme.primary}12`, border: `1px solid ${theme.primary}20`, borderRadius: 12, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: theme.primary, animation: "pulse-ring 1s ease-in-out infinite" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{ru ? "Синхронизация..." : "Syncing..."}</span>
        </div>
      )}

      {/* ── Stats cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { label: ru ? "Сегодня" : "Today",     value: todayT.length,  color: theme.primary, emoji: "📌" },
          { label: ru ? "Активно" : "Active",     value: active.length,  color: "#f59e0b",     emoji: "⚡" },
          { label: ru ? "Готово" : "Done",        value: done.length,    color: "#22c55e",     emoji: "✅" },
        ].map((s) => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "14px 12px" }}>
            <p style={{ fontSize: 22, margin: "0 0 2px 0" }}>{s.emoji}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: s.color, margin: "0 0 2px 0", letterSpacing: "-0.5px" }}>{s.value}</p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0, fontWeight: 500 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Birthdays ── */}
      {todayBirths.length > 0 && (
        <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 14, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 28 }}>🎂</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa", margin: "0 0 2px 0" }}>{ru ? "День рождения сегодня!" : "Birthday today!"}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>{todayBirths.map((b) => b.name).join(", ")}</p>
          </div>
        </div>
      )}
      {tmrBirths.length > 0 && (
        <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 14, padding: "10px 16px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 22 }}>🎂</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(167,139,250,0.8)", margin: "0 0 2px 0" }}>{ru ? "День рождения завтра" : "Birthday tomorrow"}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>{tmrBirths.map((b) => b.name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* ── Sections ── */}
      {!isTeam && categories.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px 0" }}>{ru ? "Разделы" : "Sections"}</p>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {categories.map((cat) => {
              const active2 = activeSection === cat.id;
              const cnt = cat.id === "birthdays" ? birthdays.length : cat.id === "vacations" ? vacations.length : categoryEvents.filter((e) => e.categoryId === cat.id).length;
              return (
                <button key={cat.id} onClick={() => setActiveSection(active2 ? null : cat.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, border: `1px solid ${active2 ? cat.color : "rgba(255,255,255,0.08)"}`, background: active2 ? `${cat.color}18` : "rgba(255,255,255,0.04)", color: active2 ? cat.color : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: active2 ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.18s" }}>
                  <span>{cat.icon}</span><span>{cat.name}</span>
                  {cnt > 0 && <span style={{ fontSize: 10, background: active2 ? `${cat.color}30` : "rgba(255,255,255,0.08)", borderRadius: 8, padding: "1px 5px" }}>{cnt}</span>}
                </button>
              );
            })}
          </div>
          {activeSection && sectionData && (
            <div style={{ marginTop: 10, background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
              {sectionData.length === 0
                ? <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", margin: 0, textAlign: "center" }}>{ru ? "Нет данных" : "No data"}</p>
                : sectionData.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#fff", margin: 0 }}>{item.title}</p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>{item.sub}</p>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* ── Overdue ── */}
      {overdue.length > 0 && (
        <Group title={<><Flame size={14} color="#ef4444" /> <span style={{ color: "#ef4444" }}>{ru ? "Просрочено" : "Overdue"}</span></>} count={overdue.length} countColor="#ef4444" open={showOverdue} onToggle={() => setShowOverdue(!showOverdue)}>
          {overdue.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* ── Daily no date ── */}
      {daily.length > 0 && (
        <Group title={<><Repeat2 size={14} color="#f59e0b" /> <span style={{ color: "#f59e0b" }}>{ru ? "Ежедневные" : "Daily"}</span></>} count={daily.length} countColor="#f59e0b" open={true} onToggle={() => {}}>
          {daily.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* ── Today ── */}
      <SectionBlock title={`📌 ${ru ? "Сегодня" : "Today"}`} tasks={todayT} empty={ru ? "Нет задач на сегодня" : "No tasks today"} />

      {/* ── Tomorrow ── */}
      <SectionBlock title={`📋 ${ru ? "Завтра" : "Tomorrow"}`} tasks={tmrT} empty={ru ? "Нет задач на завтра" : "No tasks tomorrow"} />

      {/* ── Later ── */}
      {later.length > 0 && <SectionBlock title={`📅 ${ru ? "Позже" : "Later"}`} tasks={later} empty="" />}

      {/* ── No date ── */}
      {noDate.length > 0 && (
        <Group title={<><Clock size={14} color="rgba(255,255,255,0.4)" /> <span style={{ color: "rgba(255,255,255,0.5)" }}>{ru ? "Без срока" : "No deadline"}</span></>} count={noDate.length} countColor="rgba(255,255,255,0.3)" open={showNoDate} onToggle={() => setShowNoDate(!showNoDate)}>
          {noDate.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* ── Done ── */}
      {done.length > 0 && (
        <Group title={<span style={{ color: "rgba(255,255,255,0.4)" }}>✅ {ru ? "Выполненные" : "Completed"}</span>} count={done.length} countColor="rgba(255,255,255,0.25)" open={showDone} onToggle={() => setShowDone(!showDone)}>
          {done.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {active.length === 0 && done.length === 0 && isDataLoaded && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <p style={{ fontSize: 48, margin: "0 0 12px 0" }}>✨</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 8px 0" }}>{ru ? "Нет задач" : "No tasks"}</p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? "Нажми + чтобы добавить" : "Tap + to add a task"}</p>
        </div>
      )}
    </div>
  );
}

function SectionBlock({ title, tasks, empty }: { title: string; tasks: any[]; empty: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</p>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "1px 6px" }}>{tasks.length}</span>
      </div>
      {tasks.length === 0
        ? <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "14px 16px", border: "1px dashed rgba(255,255,255,0.08)" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", margin: 0, textAlign: "center" }}>{empty}</p>
          </div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{tasks.map((t) => <TaskCard key={t.id} task={t} />)}</div>
      }
    </div>
  );
}

function Group({ title, count, countColor, open, onToggle, children }: {
  title: React.ReactNode; count: number; countColor: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: open ? 10 : 0, padding: 0, width: "100%" }}>
        {open ? <ChevronDown size={14} color="rgba(255,255,255,0.35)" /> : <ChevronRight size={14} color="rgba(255,255,255,0.35)" />}
        <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>{title}</span>
        <span style={{ fontSize: 11, color: countColor, background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "1px 6px", marginLeft: "auto" }}>{count}</span>
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );
}
