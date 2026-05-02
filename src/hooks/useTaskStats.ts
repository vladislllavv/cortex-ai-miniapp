import { useMemo } from "react";
import { useTaskStore } from "@/lib/store";

export function useTaskStats() {
  const tasks = useTaskStore((state) => state.tasks);

  return useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split("T")[0];

    const total = tasks.length;
    const active = tasks.filter((t) => t.status !== "done").length;
    const done = tasks.filter((t) => t.status === "done").length;
    const today = tasks.filter((t) =>
      t.dueDate?.startsWith(todayStr) && t.status !== "done"
    ).length;
    const tomorrow = tasks.filter((t) =>
      t.dueDate?.startsWith(tomorrowStr) && t.status !== "done"
    ).length;
    const overdue = tasks.filter((t) => {
      if (!t.dueDate || t.status === "done") return false;
      return new Date(t.dueDate) < now;
    }).length;
    const highPriority = tasks.filter((t) =>
      t.priority === "high" && t.status !== "done"
    ).length;
    const shopping = tasks.filter((t) =>
      t.type === "shopping" && t.status !== "done"
    ).length;
    const daily = tasks.filter((t) =>
      t.repeat === "daily" && t.status !== "done"
    ).length;
    const completionRate = total > 0
      ? Math.round((done / total) * 100)
      : 0;

    return {
      total, active, done, today, tomorrow,
      overdue, highPriority, shopping, daily, completionRate,
    };
  }, [tasks]);
}
