import { useState, useMemo } from "react";
import TaskCard from "@/components/TaskCard";
import { useTaskStore } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";

export default function HomePage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const ru = language === "ru";

  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done"),
    [tasks]
  );

  const todayTasks = useMemo(
    () => tasks.filter((t) => t.dueDate?.startsWith(todayStr) && t.status !== "done"),
    [tasks, todayStr]
  );

  const tomorrowTasks = useMemo(
    () => tasks.filter((t) => t.dueDate?.startsWith(tomorrowStr) && t.status !== "done"),
    [tasks, tomorrowStr]
  );

  const otherTasks = useMemo(
    () => activeTasks.filter(
      (t) =>
        t.dueDate &&
        !t.dueDate.startsWith(todayStr) &&
        !t.dueDate.startsWith(tomorrowStr)
    ),
    [activeTasks, todayStr, tomorrowStr]
  );

  const doneTasks = useMemo(
    () => tasks.filter((t) => t.status === "done"),
    [tasks]
  );

  const [showDone, setShowDone] = useState(false);

  return (
    <div style={{ paddingTop: "8px" }}>

      {/* Брифинг */}
      <div
        style={{
          backgroundColor: "rgba(59,130,246,0.1)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: "18px",
          padding: "18px",
          marginBottom: "24px",
        }}
      >
        <p
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.45)",
            margin: "0 0 6px 0",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {ru ? "Ежедневный брифинг" : "Daily briefing"}
        </p>
        <p
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "white",
            margin: "0 0 4px 0",
            lineHeight: 1.2,
          }}
        >
          {activeTasks.length} {ru ? "задач" : "tasks"}
        </p>
        <p
          style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.45)",
            margin: 0,
          }}
        >
          {todayTasks.length > 0
            ? ru
              ? `${todayTasks.length} на сегодня`
              : `${todayTasks.length} for today`
            : ru
            ? "На сегодня задач нет"
            : "No tasks for today"}
        </p>
      </div>

      {/* Сегодня */}
      <Section
        title={`📌 ${ru ? "Сегодня" : "Today"}`}
        count={todayTasks.length}
        empty={ru ? "Нет задач на сегодня" : "No tasks today"}
      >
        {todayTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </Section>

      {/* Завтра */}
      <Section
        title={`📋 ${ru ? "Завтра" : "Tomorrow"}`}
        count={tomorrowTasks.length}
        empty={ru ? "Нет задач на завтра" : "No tasks tomorrow"}
      >
        {tomorrowTasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </Section>

      {/* Позже */}
      {otherTasks.length > 0 && (
        <Section
          title={`📅 ${ru ? "Позже" : "Later"}`}
          count={otherTasks.length}
          empty=""
        >
          {otherTasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </Section>
      )}

      {/* Выполненные */}
      {doneTasks.length > 0 && (
        <div style={{ marginBottom: "16px" }}>
          <button
            onClick={() => setShowDone(!showDone)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              padding: 0,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              {showDone ? "▼" : "▶"}
            </span>
            <span
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              ✅ {ru ? "Выполненные" : "Completed"}{" "}
              <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400 }}>
                ({doneTasks.length})
              </span>
            </span>
          </button>

          {showDone && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {doneTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <p
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.75)",
            margin: 0,
          }}
        >
          {title}
        </p>
        <span
          style={{
            fontSize: "13px",
            color: "rgba(255,255,255,0.25)",
          }}
        >
          ({count})
        </span>
      </div>

      {count === 0 ? (
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            borderRadius: "14px",
            padding: "18px",
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.25)",
              margin: 0,
            }}
          >
            {empty}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
