import { useState, useMemo } from "react";
import TaskCard from "@/components/TaskCard";
import DraggableTaskList from "@/components/DraggableTaskList";
import SearchBar from "@/components/SearchBar";
import AiSmartSort from "@/components/AiSmartSort";
import { useTaskStore } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import {
  ChevronRight, ChevronDown, Clock, Repeat2, Flame, TrendingUp, Timer,
} from "lucide-react";
import AssignedTasksBanner from "@/components/AssignedTasksBanner";
import { useTeamStore } from "@/lib/teamStore";
import { PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";
import { useTheme } from "@/contexts/ThemeContext";
import { getAccentGradient, getSecondaryColor } from "@/lib/theme";

// ─── Week chart ───────────────────────────────────────────────────
function WeekChart({ tasks }: { tasks: any[] }) {
  const { theme } = useTheme();
  const gradient = getAccentGradient(theme);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().split("T")[0];
    return {
      label: d.toLocaleDateString("ru-RU", { weekday: "narrow" }),
      done:  tasks.filter((t) => t.status === "done" && t.completedAt?.startsWith(ds)).length,
      total: tasks.filter((t) => t.createdAt?.startsWith(ds)).length,
      isToday: i === 6,
    };
  }), [tasks]);
  const maxVal = Math.max(...days.map((d) => Math.max(d.total, d.done)), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 44 }}>
      {days.map((day, i) => {
        const th = Math.max((day.total / maxVal) * 32, day.total > 0 ? 3 : 0);
        const dh = Math.max((day.done / maxVal) * 32, day.done > 0 ? 3 : 0);
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ width: "100%", height: 32, borderRadius: 4, background: "rgba(255,255,255,0.07)", position: "relative", overflow: "hidden" }}>
              {th > 0 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: th, background: `${theme.primary}35` }} />}
              {dh > 0 && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: dh, background: day.isToday ? gradient : `${theme.primary}80`, borderRadius: "0 0 4px 4px" }} />}
              {day.isToday && <div style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: "50%", background: theme.primary }} />}
            </div>
            <span style={{ fontSize: 9, color: day.isToday ? theme.primary : "rgba(255,255,255,0.25)", fontWeight: day.isToday ? 700 : 400 }}>{day.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Ring ─────────────────────────────────────────────────────────
function Ring({ v, total, color, size = 60 }: { v: number; total: number; color: string; size?: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, pct = total > 0 ? v / total : 0;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${c * pct} ${c * (1 - pct)}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

interface Props { onOpenPomodoro?: () => void; }

export default function HomePage({ onOpenPomodoro }: Props) {
  const language = useI18nStore((s) => s.language);
  const tasks    = useTaskStore((s) => s.tasks);
  const birthdays = useTaskStore((s) => s.birthdays);
  const vacations = useTaskStore((s) => s.vacations);
  const categories     = useTaskStore((s) => s.categories);
  const categoryEvents = useTaskStore((s) => s.categoryEvents);
  const isDataLoaded   = useTaskStore((s) => s.isDataLoaded);
  const activeWorkspaceId = useTaskStore((s) => s.activeWorkspaceId);
  const { workspaces } = useTeamStore();
  const { theme }  = useTheme();
  const ru = language === "ru";
  const gradient = getAccentGradient(theme);
  const sec = getSecondaryColor(theme);

  const isTeam    = activeWorkspaceId !== PERSONAL_WORKSPACE_ID;
  const currentWs = workspaces.find((w) => w.id === activeWorkspaceId);

  const now      = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const tmrDate  = new Date(now); tmrDate.setDate(now.getDate() + 1);
  const tmrStr   = tmrDate.toISOString().split("T")[0];
  const todayMD  = `${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const tmrMD    = `${String(tmrDate.getMonth()+1).padStart(2,"0")}-${String(tmrDate.getDate()).padStart(2,"0")}`;

  const todayBirths = birthdays.filter((b) => b.date === todayMD);
  const tmrBirths   = birthdays.filter((b) => b.date === tmrMD);

  const active   = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const done     = useMemo(() => tasks.filter((t) => t.status === "done"),  [tasks]);
  const withDate = useMemo(() => active.filter((t) => t.dueDate), [active]);

  const todayT  = useMemo(() => withDate.filter((t) => t.dueDate?.startsWith(todayStr)), [withDate, todayStr]);
  const tmrT    = useMemo(() => withDate.filter((t) => t.dueDate?.startsWith(tmrStr)), [withDate, tmrStr]);
  const overdue = useMemo(() => withDate.filter((t) => new Date(t.dueDate!) < now && !t.dueDate!.startsWith(todayStr)), [withDate, todayStr]);
  const later   = useMemo(() => withDate.filter((t) => new Date(t.dueDate!) >= now && !t.dueDate!.startsWith(todayStr) && !t.dueDate!.startsWith(tmrStr)), [withDate, todayStr, tmrStr]);
  const noDate  = useMemo(() => active.filter((t) => !t.dueDate && t.repeat !== "daily"), [active]);
  const daily   = useMemo(() => active.filter((t) => t.repeat === "daily" && !t.dueDate), [active]);
  const highPri = useMemo(() => active.filter((t) => t.priority === "high"), [active]);

  // Sort today tasks by sortOrder
  const todaySorted = useMemo(() => [...todayT].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)), [todayT]);

  const rate = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  const [showDone,    setShowDone]    = useState(false);
  const [showNoDate,  setShowNoDate]  = useState(false);
  const [showOverdue, setShowOverdue] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const sectionData = useMemo(() => {
    if (!activeSection) return null;
    if (activeSection === "birthdays") return birthdays.map((b) => ({ id: b.id, title: b.name, sub: b.date, color: b.color, icon: "🎂" }));
    if (activeSection === "vacations") return vacations.map((v) => ({ id: v.id, title: v.title, sub: `${v.startDate} — ${v.endDate}`, color: v.color, icon: "🌴" }));
    return categoryEvents.filter((e) => e.categoryId === activeSection).map((e) => {
      const cat = categories.find((c) => c.id === e.categoryId);
      return { id: e.id, title: e.title, sub: e.endDate ? `${e.date} — ${e.endDate}` : e.date, color: e.color || cat?.color || theme.primary, icon: cat?.icon || "📁" };
    });
  }, [activeSection, birthdays, vacations, categoryEvents, categories, theme]);

  const h = now.getHours();
  const greeting = ru
    ? (h < 6 ? "Доброй ночи 🌙" : h < 12 ? "Доброе утро ☀️" : h < 18 ? "Добрый день 👋" : "Добрый вечер 🌆")
    : (h < 6 ? "Good night 🌙"  : h < 12 ? "Good morning ☀️" : h < 18 ? "Good afternoon 👋" : "Good evening 🌆");

  return (
    <div style={{ paddingTop: 4 }}>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "0 0 2px 0", textTransform: "capitalize" }}>
          {now.toLocaleDateString(ru ? "ru-RU" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.5px" }}>
            {greeting}
          </h1>
          {/* Pomodoro quick-launch */}
          {onOpenPomodoro && (
            <button onClick={onOpenPomodoro} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
              background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.18s",
            }}>
              <Timer size={14} color="#a5b4fc" />
              <span style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 600 }}>Focus</span>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <SearchBar />

      {/* AI Smart Sort */}
      {active.length >= 3 && <AiSmartSort />}

      <AssignedTasksBanner />

      {/* Team badge */}
      {isTeam && currentWs && (
        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "8px 14px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <span>👥</span>
          <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600 }}>{currentWs.name}</span>
        </div>
      )}

      {/* Syncing */}
      {!isDataLoaded && (
        <div style={{ background: `${theme.primary}10`, border: `1px solid ${theme.primary}20`, borderRadius: 12, padding: "8px 14px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: theme.primary, animation: "pulse-ring 1s ease-in-out infinite" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{ru ? "Синхронизация..." : "Syncing..."}</span>
        </div>
      )}

      {/* Hero progress card */}
      {tasks.length > 0 && (
        <div style={{ background: gradient, borderRadius: 20, padding: "16px 18px 14px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -24, right: -24, width: 96, height: 96, borderRadius: "50%", background: "rgba(255,255,255,0.07)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: "0 0 4px 0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                {ru ? "Прогресс" : "Progress"}
              </p>
              <p style={{ fontSize: 30, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-1px" }}>
                {done.length}<span style={{ fontSize: 16, fontWeight: 400, color: "rgba(255,255,255,0.6)", marginLeft: 4 }}>/ {tasks.length}</span>
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: "2px 0 0 0" }}>
                {overdue.length > 0 ? `⚠️ ${overdue.length} ${ru ? "просрочено" : "overdue"}` : todayT.length > 0 ? `📌 ${todayT.length} ${ru ? "на сегодня" : "today"}` : (ru ? "Всё по плану ✅" : "All on track ✅")}
              </p>
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ring v={done.length} total={tasks.length} color="rgba(255,255,255,0.9)" size={60} />
              <span style={{ position: "absolute", fontSize: 13, fontWeight: 800, color: "#fff" }}>{rate}%</span>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", margin: "0 0 5px 0", display: "flex", alignItems: "center", gap: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <TrendingUp size={9} /> {ru ? "7 дней" : "7 days"}
            </p>
            <WeekChart tasks={tasks} />
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 18 }}>
        {[
          { label: ru ? "Всего" : "Total",   v: active.length,  c: theme.primary, e: "📋" },
          { label: ru ? "Сегодня" : "Today", v: todayT.length,  c: sec,           e: "📌" },
          { label: ru ? "Готово" : "Done",   v: done.length,    c: "#22c55e",     e: "✅" },
          { label: "🔴",                      v: highPri.length, c: highPri.length > 0 ? "#ef4444" : "rgba(255,255,255,0.3)", e: "🔴" },
        ].map((s) => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
            <p style={{ fontSize: 14, margin: "0 0 2px 0" }}>{s.e}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: s.c, margin: "0 0 2px 0", letterSpacing: "-0.5px" }}>{s.v}</p>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Birthdays */}
      {todayBirths.length > 0 && (
        <div style={{ background: `${theme.primary}15`, border: `1px solid ${theme.primary}30`, borderRadius: 16, padding: "12px 16px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 24 }}>🎂</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: theme.primary, margin: "0 0 2px 0" }}>{ru ? "День рождения сегодня!" : "Birthday today!"}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>{todayBirths.map((b) => b.name).join(", ")}</p>
          </div>
        </div>
      )}
      {tmrBirths.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "10px 16px", marginBottom: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>🎂</span>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>{ru ? "Завтра: " : "Tomorrow: "}{tmrBirths.map((b) => b.name).join(", ")}</p>
        </div>
      )}

      {/* Categories */}
      {!isTeam && categories.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 8px 0" }}>{ru ? "Разделы" : "Sections"}</p>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
            {categories.map((cat) => {
              const isA = activeSection === cat.id;
              const cnt = cat.id === "birthdays" ? birthdays.length : cat.id === "vacations" ? vacations.length : categoryEvents.filter((e) => e.categoryId === cat.id).length;
              return (
                <button key={cat.id} onClick={() => setActiveSection(isA ? null : cat.id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: `1px solid ${isA ? cat.color : "rgba(255,255,255,0.08)"}`, background: isA ? `${cat.color}16` : "rgba(255,255,255,0.04)", color: isA ? cat.color : "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: isA ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" }}>
                  <span>{cat.icon}</span><span>{cat.name}</span>
                  {cnt > 0 && <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", borderRadius: 6, padding: "1px 5px" }}>{cnt}</span>}
                </button>
              );
            })}
          </div>
          {activeSection && sectionData && (
            <div style={{ marginTop: 10, background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              {sectionData.length === 0
                ? <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", margin: 0, textAlign: "center" }}>{ru ? "Нет данных" : "No data"}</p>
                : sectionData.map((item) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#fff", margin: 0 }}>{item.title}</p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>{item.sub}</p>
                    </div>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* High priority banner */}
      {highPri.length > 0 && (
        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 14, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <Flame size={15} color="#ef4444" />
          <p style={{ fontSize: 13, color: "#fca5a5", margin: 0, fontWeight: 500 }}>
            {highPri.length} {ru ? "задач высокого приоритета" : "high-priority tasks"}
          </p>
        </div>
      )}

      {/* Overdue */}
      {overdue.length > 0 && (
        <Group icon={<Flame size={12} color="#ef4444" />} label={ru ? "Просрочено" : "Overdue"} labelColor="#ef4444" count={overdue.length} open={showOverdue} onToggle={() => setShowOverdue(!showOverdue)}>
          {overdue.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* Daily */}
      {daily.length > 0 && (
        <Group icon={<Repeat2 size={12} color="#f59e0b" />} label={ru ? "Ежедневные" : "Daily"} labelColor="#f59e0b" count={daily.length} open={true} onToggle={() => {}}>
          {daily.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* Today — with drag & drop */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>📌</span>
          <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: 0, textTransform: "uppercase", letterSpacing: "0.6px" }}>{ru ? "Сегодня" : "Today"}</p>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "1px 6px" }}>{todayT.length}</span>
          {todayT.length > 1 && (
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>
              {ru ? "↕ перетащи для сортировки" : "↕ drag to reorder"}
            </span>
          )}
        </div>
        {todayT.length === 0
          ? <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "12px 16px", border: "1px dashed rgba(255,255,255,0.07)" }}>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", margin: 0, textAlign: "center" }}>{ru ? "На сегодня задач нет" : "No tasks today"}</p>
            </div>
          : <DraggableTaskList tasks={todaySorted} />
        }
      </div>

      {/* Tomorrow */}
      <SB title={ru ? "Завтра" : "Tomorrow"} emoji="📋" tasks={tmrT} empty={ru ? "На завтра задач нет" : "No tasks tomorrow"} />
      {later.length > 0 && <SB title={ru ? "Позже" : "Later"} emoji="📅" tasks={later} empty="" />}

      {/* No date */}
      {noDate.length > 0 && (
        <Group icon={<Clock size={12} color="rgba(255,255,255,0.35)" />} label={ru ? "Без срока" : "No deadline"} labelColor="rgba(255,255,255,0.45)" count={noDate.length} open={showNoDate} onToggle={() => setShowNoDate(!showNoDate)}>
          {noDate.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* Done */}
      {done.length > 0 && (
        <Group icon={null} label={`✅ ${ru ? "Выполненные" : "Completed"}`} labelColor="rgba(255,255,255,0.35)" count={done.length} open={showDone} onToggle={() => setShowDone(!showDone)}>
          {done.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* Empty */}
      {active.length === 0 && done.length === 0 && isDataLoaded && (
        <div style={{ textAlign: "center", padding: "44px 20px" }}>
          <p style={{ fontSize: 52, margin: "0 0 12px 0" }}>✨</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 6px 0" }}>{ru ? "Пусто!" : "Empty!"}</p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {ru ? "Нажми + чтобы добавить первую задачу" : "Tap + to add your first task"}
          </p>
        </div>
      )}
    </div>
  );
}

function SB({ title, emoji, tasks, empty }: { title: string; emoji: string; tasks: any[]; empty: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13 }}>{emoji}</span>
        <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: 0, textTransform: "uppercase", letterSpacing: "0.6px" }}>{title}</p>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "1px 6px" }}>{tasks.length}</span>
      </div>
      {tasks.length === 0
        ? <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "12px 16px", border: "1px dashed rgba(255,255,255,0.07)" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", margin: 0, textAlign: "center" }}>{empty}</p>
          </div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{tasks.map((t) => <TaskCard key={t.id} task={t} />)}</div>
      }
    </div>
  );
}

function Group({ icon, label, labelColor, count, open, onToggle, children }: {
  icon: React.ReactNode; label: string; labelColor: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, marginBottom: open ? 10 : 0, padding: 0, width: "100%", fontFamily: "inherit" }}>
        {open ? <ChevronDown size={12} color="rgba(255,255,255,0.3)" /> : <ChevronRight size={12} color="rgba(255,255,255,0.3)" />}
        {icon}
        <span style={{ fontSize: 12, fontWeight: 700, color: labelColor, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
        <span style={{ fontSize: 10, color: labelColor, background: "rgba(255,255,255,0.06)", borderRadius: 7, padding: "1px 7px", marginLeft: "auto" }}>{count}</span>
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );
}
