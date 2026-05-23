import { useState, useMemo } from "react";
import TaskCard from "@/components/TaskCard";
import { useTaskStore } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { ChevronRight, ChevronDown, Clock, Repeat2, Flame, TrendingUp } from "lucide-react";
import AssignedTasksBanner from "@/components/AssignedTasksBanner";
import { useTeamStore } from "@/lib/teamStore";
import { PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";
import { useTheme } from "@/contexts/ThemeContext";
import { getAccentGradient, getSecondaryColor } from "@/lib/theme";

// ─── Мини-гистограмма выполнения ─────────────────────────────────
function WeekChart({ tasks }: { tasks: any[] }) {
  const { theme } = useTheme();
  const days = useMemo(() => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      const done   = tasks.filter((t) => t.status === "done" && t.completedAt?.startsWith(ds)).length;
      const created = tasks.filter((t) => t.createdAt?.startsWith(ds)).length;
      result.push({ label: d.toLocaleDateString("ru-RU", { weekday: "narrow" }), done, created, isToday: i === 0 });
    }
    return result;
  }, [tasks]);

  const maxVal = Math.max(...days.map((d) => d.created), 1);
  const gradient = getAccentGradient(theme);
  const sec = getSecondaryColor(theme);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 48 }}>
      {days.map((day, i) => {
        const heightPct = day.created / maxVal;
        const donePct   = day.created > 0 ? day.done / day.created : 0;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{
              width: "100%", height: 36, borderRadius: 4,
              background: "rgba(255,255,255,0.06)",
              position: "relative", overflow: "hidden",
            }}>
              {/* total bar */}
              {day.created > 0 && (
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  height: `${Math.max(heightPct * 100, 15)}%`,
                  background: `${theme.primary}30`,
                }} />
              )}
              {/* done bar */}
              {day.done > 0 && (
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  height: `${Math.max(donePct * heightPct * 100, 8)}%`,
                  background: day.isToday ? gradient : `${theme.primary}80`,
                  borderRadius: "0 0 4px 4px",
                }} />
              )}
              {/* today indicator */}
              {day.isToday && (
                <div style={{ position: "absolute", top: 2, right: 2, width: 4, height: 4, borderRadius: "50%", background: theme.primary }} />
              )}
            </div>
            <span style={{ fontSize: 9, color: day.isToday ? theme.primary : "rgba(255,255,255,0.3)", fontWeight: day.isToday ? 700 : 400 }}>
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Кольцевой прогресс ────────────────────────────────────────────
function RingProgress({ value, total, color, size = 56 }: { value: number; total: number; color: string; size?: number }) {
  const pct = total > 0 ? value / total : 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={6} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    </svg>
  );
}

export default function HomePage() {
  const language = useI18nStore((s) => s.language);
  const tasks    = useTaskStore((s) => s.tasks);
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

  const now     = new Date();
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

  const completionRate = tasks.length > 0 ? Math.round((done.length / tasks.length) * 100) : 0;

  const [showDone,    setShowDone]    = useState(false);
  const [showNoDate,  setShowNoDate]  = useState(true);
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

  const hour = now.getHours();
  const greeting = ru
    ? (hour < 6 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер")
    : (hour < 6 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

  const gradient = getAccentGradient(theme);
  const sec = getSecondaryColor(theme);

  return (
    <div style={{ paddingTop: 4 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 2px 0", textTransform: "capitalize" }}>
          {now.toLocaleDateString(ru ? "ru-RU" : "en-US", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.5px" }}>
          {greeting} 👋
        </h1>
      </div>

      <AssignedTasksBanner />

      {/* Team badge */}
      {isTeam && currentWs && (
        <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>👥</span>
          <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 600 }}>{currentWs.name}</span>
        </div>
      )}

      {/* Syncing */}
      {!isDataLoaded && (
        <div style={{ background: `${theme.primary}12`, border: `1px solid ${theme.primary}20`, borderRadius: 12, padding: "8px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: theme.primary, animation: "pulse-ring 1s ease-in-out infinite" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{ru ? "Синхронизация..." : "Syncing..."}</span>
        </div>
      )}

      {/* ── Hero card с графиком ── */}
      <div style={{
        background: gradient,
        borderRadius: 20, padding: "18px 18px 14px", marginBottom: 16,
        position: "relative", overflow: "hidden",
      }}>
        {/* bg decoration */}
        <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
        <div style={{ position: "absolute", bottom: -30, right: 40, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", margin: "0 0 4px 0", textTransform: "uppercase", letterSpacing: "0.8px" }}>
              {ru ? "Прогресс дня" : "Daily progress"}
            </p>
            <p style={{ fontSize: 32, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-1px" }}>
              {todayT.length}
              <span style={{ fontSize: 16, fontWeight: 500, color: "rgba(255,255,255,0.7)", marginLeft: 6 }}>
                {ru ? "на сегодня" : "today"}
              </span>
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "4px 0 0 0" }}>
              {overdue.length > 0
                ? (ru ? `⚠️ ${overdue.length} просрочено` : `⚠️ ${overdue.length} overdue`)
                : done.length > 0
                ? (ru ? `✅ ${done.length} выполнено` : `✅ ${done.length} done`)
                : (ru ? "Начинай день!" : "Start your day!")}
            </p>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RingProgress value={done.length} total={tasks.length} color="rgba(255,255,255,0.9)" size={64} />
            <span style={{ position: "absolute", fontSize: 14, fontWeight: 800, color: "#fff" }}>
              {completionRate}%
            </span>
          </div>
        </div>

        {/* Mini chart */}
        <div>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: 4 }}>
            <TrendingUp size={10} />{ru ? "7 дней" : "7 days"}
          </p>
          <WeekChart tasks={tasks} />
        </div>
      </div>

      {/* ── Stats row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { label: ru ? "Всего" : "Total",   value: active.length,  color: theme.primary,   emoji: "📋" },
          { label: ru ? "Сегодня" : "Today", value: todayT.length,  color: sec,             emoji: "📌" },
          { label: ru ? "Готово" : "Done",   value: done.length,    color: "#22c55e",       emoji: "✅" },
          { label: ru ? "Просроч" : "Late",  value: overdue.length, color: overdue.length > 0 ? "#ef4444" : "rgba(255,255,255,0.3)", emoji: overdue.length > 0 ? "🔥" : "⏱" },
        ].map((s) => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
            <p style={{ fontSize: 16, margin: "0 0 2px 0" }}>{s.emoji}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: s.color, margin: "0 0 2px 0", letterSpacing: "-0.5px" }}>{s.value}</p>
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", margin: 0, fontWeight: 600, textTransform: "uppercase" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Birthdays ── */}
      {todayBirths.length > 0 && (
        <div style={{ background: `linear-gradient(135deg, ${theme.primary}18, ${sec}18)`, border: `1px solid ${theme.primary}30`, borderRadius: 16, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 26 }}>🎂</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: theme.primary, margin: "0 0 2px 0" }}>{ru ? "День рождения сегодня!" : "Birthday today!"}</p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>{todayBirths.map((b) => b.name).join(", ")}</p>
          </div>
        </div>
      )}
      {tmrBirths.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "10px 16px", marginBottom: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 20 }}>🎂</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: "0 0 2px 0" }}>{ru ? "День рождения завтра" : "Birthday tomorrow"}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: 0 }}>{tmrBirths.map((b) => b.name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* ── Sections ── */}
      {!isTeam && categories.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px 0" }}>{ru ? "Разделы" : "Sections"}</p>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
            {categories.map((cat) => {
              const isActive = activeSection === cat.id;
              const cnt = cat.id === "birthdays" ? birthdays.length : cat.id === "vacations" ? vacations.length : categoryEvents.filter((e) => e.categoryId === cat.id).length;
              return (
                <button key={cat.id} onClick={() => setActiveSection(isActive ? null : cat.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, border: `1px solid ${isActive ? cat.color : "rgba(255,255,255,0.08)"}`, background: isActive ? `${cat.color}18` : "rgba(255,255,255,0.04)", color: isActive ? cat.color : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: isActive ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.18s", fontFamily: "inherit" }}>
                  <span>{cat.icon}</span><span>{cat.name}</span>
                  {cnt > 0 && <span style={{ fontSize: 10, background: isActive ? `${cat.color}30` : "rgba(255,255,255,0.08)", borderRadius: 8, padding: "1px 5px" }}>{cnt}</span>}
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
        <Group icon={<Flame size={13} color="#ef4444" />} title={<span style={{ color: "#ef4444" }}>{ru ? "Просрочено" : "Overdue"}</span>} count={overdue.length} countColor="#ef4444" open={showOverdue} onToggle={() => setShowOverdue(!showOverdue)}>
          {overdue.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* ── Daily ── */}
      {daily.length > 0 && (
        <Group icon={<Repeat2 size={13} color="#f59e0b" />} title={<span style={{ color: "#f59e0b" }}>{ru ? "Ежедневные" : "Daily"}</span>} count={daily.length} countColor="#f59e0b" open={true} onToggle={() => {}}>
          {daily.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* ── Today ── */}
      <SB title={`📌 ${ru ? "Сегодня" : "Today"}`} tasks={todayT} empty={ru ? "Нет задач на сегодня" : "No tasks today"} primary={theme.primary} />
      <SB title={`📋 ${ru ? "Завтра" : "Tomorrow"}`} tasks={tmrT} empty={ru ? "Нет задач на завтра" : "No tasks tomorrow"} primary={theme.primary} />
      {later.length > 0 && <SB title={`📅 ${ru ? "Позже" : "Later"}`} tasks={later} empty="" primary={theme.primary} />}

      {/* ── No date ── */}
      {noDate.length > 0 && (
        <Group icon={<Clock size={13} color="rgba(255,255,255,0.4)" />} title={<span style={{ color: "rgba(255,255,255,0.5)" }}>{ru ? "Без срока" : "No deadline"}</span>} count={noDate.length} countColor="rgba(255,255,255,0.3)" open={showNoDate} onToggle={() => setShowNoDate(!showNoDate)}>
          {noDate.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {/* ── Done ── */}
      {done.length > 0 && (
        <Group icon={null} title={<span style={{ color: "rgba(255,255,255,0.35)" }}>✅ {ru ? "Выполненные" : "Completed"}</span>} count={done.length} countColor="rgba(255,255,255,0.25)" open={showDone} onToggle={() => setShowDone(!showDone)}>
          {done.map((t) => <TaskCard key={t.id} task={t} />)}
        </Group>
      )}

      {active.length === 0 && done.length === 0 && isDataLoaded && (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✨</div>
          <p style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 8px 0" }}>{ru ? "Нет задач!" : "No tasks!"}</p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? "Нажми + чтобы добавить первую задачу" : "Tap + to add your first task"}</p>
        </div>
      )}
    </div>
  );
}

function SB({ title, tasks, empty, primary }: { title: string; tasks: any[]; empty: string; primary: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: 0, textTransform: "uppercase", letterSpacing: "0.6px" }}>{title}</p>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "1px 6px" }}>{tasks.length}</span>
      </div>
      {tasks.length === 0
        ? <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: "14px 16px", border: "1px dashed rgba(255,255,255,0.07)" }}>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", margin: 0, textAlign: "center" }}>{empty}</p>
          </div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{tasks.map((t) => <TaskCard key={t.id} task={t} />)}</div>
      }
    </div>
  );
}

function Group({ icon, title, count, countColor, open, onToggle, children }: { icon: React.ReactNode; title: React.ReactNode; count: number; countColor: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <button onClick={onToggle} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, marginBottom: open ? 10 : 0, padding: 0, width: "100%", fontFamily: "inherit" }}>
        {open ? <ChevronDown size={13} color="rgba(255,255,255,0.3)" /> : <ChevronRight size={13} color="rgba(255,255,255,0.3)" />}
        {icon}
        <span style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</span>
        <span style={{ fontSize: 10, color: countColor, background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "1px 7px", marginLeft: "auto" }}>{count}</span>
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
    </div>
  );
}
