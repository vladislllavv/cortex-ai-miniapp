import { useState, useMemo } from "react";
import Header from "@/components/Header";
import AddBtn from "@/components/AddBtn";
import TaskCard from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { t, useI18nStore } from "@/lib/i18n";
import { useTaskStore } from "@/lib/store";

export default function HomePage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const [showWelcome, setShowWelcome] = useState(() => {
    return !localStorage.getItem("cortex-welcomed");
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

  // Все незавершённые задачи
  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done"),
    [tasks]
  );

  // Задачи на сегодня
  const todayTasks = useMemo(
    () => tasks.filter((task) => task.dueDate?.startsWith(todayStr) && task.status !== "done"),
    [tasks, todayStr]
  );

  // Задачи на завтра
  const tomorrowTasks = useMemo(
    () => tasks.filter((task) => task.dueDate?.startsWith(tomorrowStr) && task.status !== "done"),
    [tasks, tomorrowStr]
  );

  // Задачи на другие даты (не сегодня и не завтра)
  const otherTasks = useMemo(
    () =>
      activeTasks.filter(
        (task) =>
          task.dueDate &&
          !task.dueDate.startsWith(todayStr) &&
          !task.dueDate.startsWith(tomorrowStr)
      ),
    [activeTasks, todayStr, tomorrowStr]
  );

  // Выполненные задачи
  const doneTasks = useMemo(
    () => tasks.filter((task) => task.status === "done"),
    [tasks]
  );

  const highestPriorityTask = todayTasks.length
    ? todayTasks.reduce((prev, curr) =>
        (curr.priority === "high" ? 3 : curr.priority === "medium" ? 2 : 1) >
        (prev.priority === "high" ? 3 : prev.priority === "medium" ? 2 : 1)
          ? curr
          : prev
      )
    : activeTasks.length
    ? activeTasks[0]
    : null;

  const [showDone, setShowDone] = useState(false);

  const handleWelcome = () => {
    localStorage.setItem("cortex-welcomed", "true");
    setShowWelcome(false);
  };

  return (
    <section className="space-y-4 pt-2">
      <Header />

      {showWelcome ? (
        <Card className="space-y-3 text-slate-800">
          <h2 className="text-lg font-bold text-slate-900">{t(language, "welcomeTitle")}</h2>
          <p className="text-sm text-slate-600">{t(language, "welcomeDescription")}</p>
          <Button className="w-full" onClick={handleWelcome}>
            {t(language, "welcomeStart")}
          </Button>
        </Card>
      ) : null}

      {/* Брифинг */}
      <Card className="space-y-2 text-slate-800">
        <h2 className="text-sm font-semibold text-slate-900">{t(language, "dailyBriefing")}</h2>
        <p className="text-xs text-slate-600">
          {t(language, "tasksForToday").replace("{count}", String(activeTasks.length))}
        </p>
        {highestPriorityTask ? (
          <p className="text-xs text-slate-600">
            {t(language, "startWith")}{" "}
            <span className="font-semibold text-slate-900">{highestPriorityTask.title}</span>.
          </p>
        ) : null}
      </Card>

      {/* Сегодня */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">
          📌 {t(language, "today")}{" "}
          <span className="text-white/50">({todayTasks.length})</span>
        </h3>
        <div className="space-y-2">
          {todayTasks.length ? (
            todayTasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <Card className="text-xs text-slate-500">{t(language, "noTasksToday")}</Card>
          )}
        </div>
      </div>

      {/* Завтра */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-white">
          📋 {t(language, "tomorrow")}{" "}
          <span className="text-white/50">({tomorrowTasks.length})</span>
        </h3>
        <div className="space-y-2">
          {tomorrowTasks.length ? (
            tomorrowTasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <Card className="text-xs text-slate-500">{t(language, "noTasksTomorrow")}</Card>
          )}
        </div>
      </div>

      {/* Позже */}
      {otherTasks.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white">
            📅 {language === "ru" ? "Позже" : "Later"}{" "}
            <span className="text-white/50">({otherTasks.length})</span>
          </h3>
          <div className="space-y-2">
            {otherTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* Выполненные */}
      {doneTasks.length > 0 && (
        <div>
          <button
            className="mb-2 text-sm font-semibold text-white/60 cursor-pointer hover:text-white/80 transition-colors"
            onClick={() => setShowDone(!showDone)}
          >
            {showDone ? "▼" : "▶"} ✅ {language === "ru" ? "Выполненные" : "Completed"}{" "}
            <span className="text-white/40">({doneTasks.length})</span>
          </button>
          {showDone && (
            <div className="space-y-2">
              {doneTasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      )}

      <AddBtn />
    </section>
  );
}
