import { useState, useMemo } from "react";
import TaskCard from "@/components/TaskCard";
import { useTaskStore, getTelegramUserId } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { Plus, ChevronDown, ChevronRight } from "lucide-react";

export default function HomePage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const birthdays = useTaskStore((state) => state.birthdays);
  const categories = useTaskStore((state) => state.categories);
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

  const activeTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const todayTasks = useMemo(() => tasks.filter((t) => t.dueDate?.startsWith(todayStr) && t.status !== "done"), [tasks, todayStr]);
  const tomorrowTasks = useMemo(() => tasks.filter((t) => t.dueDate?.startsWith(tomorrowStr) && t.status !== "done"), [tasks, tomorrowStr]);
  const otherTasks = useMemo(() => activeTasks.filter((t) => t.dueDate && !t.dueDate.startsWith(todayStr) && !t.dueDate.startsWith(tomorrowStr)), [activeTasks, todayStr, tomorrowStr]);
  const doneTasks = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  const [showDone, setShowDone] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  return (
    <div style={{ paddingTop: "8px" }}>

      {/* Брифинг */}
      <div style={{
        backgroundColor: "rgba(59,130,246,0.1)",
        border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: "18px", padding: "16px",
        marginBottom: "16px",
      }}>
        <p style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.4)", margin: "0 0 4px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {ru ? "Ежедневный брифинг" : "Daily briefing"}
        </p>
        <p style={{ fontSize: "26px", fontWeight: 700, color: "white", margin: "0 0 4px 0", lineHeight: 1.2 }}>
          {activeTasks.length} {ru ? "задач" : "tasks"}
        </p>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
          {todayTasks.length > 0
            ? ru ? `${todayTasks.length} на сегодня` : `${todayTasks.length} for today`
            : ru ? "На сегодня задач нет" : "No tasks for today"}
        </p>
      </div>

      {/* Дни рождения сегодня */}
      {todayBirthdays.length > 0 && (
        <div style={{
          backgroundColor: "rgba(59,130,246,0.1)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: "14px", padding: "12px 14px",
          marginBottom: "12px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{ fontSize: "20px" }}>🎂</span>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#93c5fd", margin: 0 }}>
              {ru ? "День рождения сегодня!" : "Birthday today!"}
            </p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: 0 }}>
              {todayBirthdays.map((b) => b.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Дни рождения завтра */}
      {tomorrowBirthdays.length > 0 && (
        <div style={{
          backgroundColor: "rgba(59,130,246,0.07)",
          border: "1px solid rgba(59,130,246,0.15)",
          borderRadius: "14px", padding: "12px 14px",
          marginBottom: "12px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{ fontSize: "20px" }}>🎂</span>
          <div>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(147,197,253,0.8)", margin: 0 }}>
              {ru ? "День рождения завтра" : "Birthday tomorrow"}
            </p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
              {tomorrowBirthdays.map((b) => b.name).join(", ")}
            </p>
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
                </button>
              );
            })}
          </div>
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
