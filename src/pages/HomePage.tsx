import { useState, useMemo } from "react";
import TaskCard from "@/components/TaskCard";
import { useTaskStore } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

export default function HomePage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const birthdays = useTaskStore((state) => state.birthdays);
  const vacations = useTaskStore((state) => state.vacations);
  const categories = useTaskStore((state) => state.categories);
  const categoryEvents = useTaskStore((state) => state.categoryEvents);
  const deleteCategoryEvent = useTaskStore((state) => state.deleteCategoryEvent);
  const ru = language === "ru";

  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

  const now = new Date();
  const todayMonth = String(now.getMonth() + 1).padStart(2, "0");
  const todayDay = String(now.getDate()).padStart(2, "0");
  const tomorrowMonth = String(tomorrowDate.getMonth() + 1).padStart(2, "0");
  const tomorrowDay = String(tomorrowDate.getDate()).padStart(2, "0");

  const todayBirthdays = birthdays.filter((b) => b.date === `${todayMonth}-${todayDay}`);
  const tomorrowBirthdays = birthdays.filter((b) => b.date === `${tomorrowMonth}-${tomorrowDay}`);

  // Все активные задачи
  const activeTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);

  // БЛОК 1: Ежедневные задачи БЕЗ даты — отдельный список
  const dailyNoDate = useMemo(() =>
    activeTasks.filter((t) => t.repeat === "daily" && !t.dueDate),
    [activeTasks]
  );

  // Задачи С датой
  const tasksWithDate = useMemo(() =>
    activeTasks.filter((t) => !(t.repeat === "daily" && !t.dueDate)),
    [activeTasks]
  );

  const todayTasks = useMemo(() =>
    tasksWithDate.filter((t) => t.dueDate?.startsWith(todayStr)),
    [tasksWithDate, todayStr]
  );

  const tomorrowTasks = useMemo(() =>
    tasksWithDate.filter((t) => t.dueDate?.startsWith(tomorrowStr)),
    [tasksWithDate, tomorrowStr]
  );

  const otherTasks = useMemo(() =>
    tasksWithDate.filter((t) =>
      t.dueDate &&
      !t.dueDate.startsWith(todayStr) &&
      !t.dueDate.startsWith(tomorrowStr)
    ),
    [tasksWithDate, todayStr, tomorrowStr]
  );

  const doneTasks = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const [showDone, setShowDone] = useState(false);
  const [showDailyNoDate, setShowDailyNoDate] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const activeSectionData = useMemo(() => {
    if (!activeSection) return null;
    if (activeSection === "birthdays") {
      return birthdays.map((b) => ({ id: b.id, title: b.name, subtitle: b.date, color: b.color, icon: "🎂", type: "birthday" as const }));
    }
    if (activeSection === "vacations") {
      return vacations.map((v) => ({ id: v.id, title: v.title, subtitle: `${v.startDate} — ${v.endDate}`, color: v.color, icon: "🌴", type: "vacation" as const }));
    }
    const events = categoryEvents.filter((e) => e.categoryId === activeSection);
    return events.map((e) => {
      const cat = categories.find((c) => c.id === e.categoryId);
      return { id: e.id, title: e.title, subtitle: e.endDate ? `${e.date} — ${e.endDate}` : e.date, color: e.color || cat?.color || "#3b82f6", icon: cat?.icon || "📁", type: "event" as const };
    });
  }, [activeSection, birthdays, vacations, categoryEvents, categories]);

  return (
    <div style={{ paddingTop: "8px" }}>

      {/* Брифинг */}
      <div style={{ backgroundColor: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "18px", padding: "16px", marginBottom: "16px" }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: "0 0 4px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {ru ? "Ежедневный брифинг" : "Daily briefing"}
        </p>
        <p style={{ fontSize: "26px", fontWeight: 700, color: "white", margin: "0 0 4px 0", lineHeight: 1.2 }}>
          {activeTasks.length} {ru ? (activeTasks.length === 1 ? "задача" : activeTasks.length < 5 ? "задачи" : "задач") : "tasks"}
        </p>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
          {activeTasks.length === 0
            ? (ru ? "Все задачи выполнены! 🎉" : "All tasks done! 🎉")
            : todayTasks.length > 0
              ? ru ? `${todayTasks.length} на сегодня` : `${todayTasks.length} for today`
              : ru ? "На сегодня задач нет" : "No tasks for today"}
        </p>
      </div>

      {/* Дни рождения */}
      {todayBirthdays.length > 0 && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "14px", padding: "12px 14px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>🎂</span>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#93c5fd", margin: 0 }}>{ru ? "День рождения сегодня!" : "Birthday today!"}</p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: 0 }}>{todayBirthdays.map((b) => b.name).join(", ")}</p>
          </div>
        </div>
      )}

      {tomorrowBirthdays.length > 0 && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: "14px", padding: "12px 14px", marginBottom: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>🎂</span>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(147,197,253,0.8)", margin: 0 }}>{ru ? "День рождения завтра" : "Birthday tomorrow"}</p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{tomorrowBirthdays.map((b) => b.name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* Разделы */}
      {categories.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <p style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 8px 0" }}>
            {ru ? "Разделы" : "Sections"}
          </p>
          <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
            {categories.map((cat) => {
              const isActive = activeSection === cat.id;
              let count = 0;
              if (cat.id === "birthdays") count = birthdays.length;
              else if (cat.id === "vacations") count = vacations.length;
              else count = categoryEvents.filter((e) => e.categoryId === cat.id).length;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveSection(isActive ? null : cat.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "8px 14px", borderRadius: "20px",
                    border: isActive ? `1px solid ${cat.color}` : "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: isActive ? `${cat.color}20` : "rgba(255,255,255,0.05)",
                    color: isActive ? cat.color : "rgba(255,255,255,0.6)",
                    fontSize: "13px", fontWeight: isActive ? 600 : 400,
                    cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                  {count > 0 && (
                    <span style={{ fontSize: "11px", backgroundColor: isActive ? `${cat.color}40` : "rgba(255,255,255,0.1)", borderRadius: "10px", padding: "1px 6px" }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {activeSection && activeSectionData !== null && (
            <div style={{ marginTop: "10px", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "14px", padding: "12px", border: "1px solid rgba(255,255,255,0.07)" }}>
              {activeSectionData.length === 0 ? (
                <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", margin: 0, textAlign: "center" }}>
                  {ru ? "Нет данных. Добавь в Календаре." : "No data. Add in Calendar."}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {activeSectionData.map((item) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <span style={{ fontSize: "16px" }}>{item.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "14px", fontWeight: 500, color: "white", margin: 0, wordBreak: "break-word" }}>{item.title}</p>
                        <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{item.subtitle}</p>
                      </div>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color, flexShrink: 0 }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* БЛОК 1: Ежедневные задачи без даты */}
      {dailyNoDate.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setShowDailyNoDate(!showDailyNoDate)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: 0, width: "100%" }}
          >
            {showDailyNoDate ? <ChevronDown size={14} color="rgba(255,165,0,0.7)" /> : <ChevronRight size={14} color="rgba(255,165,0,0.7)" />}
            <RefreshCw size={13} color="rgba(255,165,0,0.7)" />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255,165,0,0.8)" }}>
              {ru ? "Ежедневные (без даты)" : "Daily (no date)"}
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,165,0,0.4)", fontWeight: 400 }}>
              ({dailyNoDate.length})
            </span>
          </button>

          {showDailyNoDate && (
            <>
              <div style={{ backgroundColor: "rgba(255,165,0,0.08)", border: "1px solid rgba(255,165,0,0.2)", borderRadius: "10px", padding: "8px 12px", marginBottom: "8px" }}>
                <p style={{ fontSize: "11px", color: "rgba(255,165,0,0.7)", margin: 0 }}>
                  {ru
                    ? "ℹ️ Эти задачи повторяются каждый день без конкретного времени. Удали ненужные или добавь дату."
                    : "ℹ️ These tasks repeat daily without a specific time. Delete unnecessary ones or add a date."}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {dailyNoDate.map((task) => <TaskCard key={task.id} task={task} />)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Сегодня */}
      <Section title={`📌 ${ru ? "Сегодня" : "Today"}`} count={todayTasks.length} empty={ru ? "Нет задач на сегодня" : "No tasks today"}>
        {todayTasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </Section>

      {/* Завтра */}
      <Section title={`📋 ${ru ? "Завтра" : "Tomorrow"}`} count={tomorrowTasks.length} empty={ru ? "Нет задач на завтра" : "No tasks tomorrow"}>
        {tomorrowTasks.map((task) => <TaskCard key={task.id} task={task} />)}
      </Section>

      {/* Позже */}
      {otherTasks.length > 0 && (
        <Section title={`📅 ${ru ? "Позже" : "Later"}`} count={otherTasks.length} empty="">
          {otherTasks.map((task) => <TaskCard key={task.id} task={task} />)}
        </Section>
      )}

      {/* Выполненные */}
      {doneTasks.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <button
            onClick={() => setShowDone(!showDone)}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", padding: 0 }}
          >
            {showDone ? <ChevronDown size={14} color="rgba(255,255,255,0.35)" /> : <ChevronRight size={14} color="rgba(255,255,255,0.35)" />}
            <span style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255,255,255,0.4)" }}>
              ✅ {ru ? "Выполненные" : "Completed"}{" "}
              <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400 }}>({doneTasks.length})</span>
            </span>
          </button>
          {showDone && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {doneTasks.map((task) => <TaskCard key={task.id} task={task} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, empty, children }: {
  title: string; count: number; empty: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <p style={{ fontSize: "14px", fontWeight: 600, color: "rgba(255,255,255,0.7)", margin: 0 }}>{title}</p>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.25)" }}>({count})</span>
      </div>
      {count === 0 ? (
        <div style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "14px", padding: "16px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", margin: 0 }}>{empty}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{children}</div>
      )}
    </div>
  );
}
