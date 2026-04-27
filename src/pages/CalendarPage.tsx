import { useMemo } from "react";
import TaskCard from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { t, useI18nStore } from "@/lib/i18n";
import { useTaskStore } from "@/lib/store";

function isoDateOnly(date: Date) {
  return date.toISOString().split("T")[0];
}

export default function CalendarPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const selectedDate = useTaskStore((state) => state.selectedDate);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);

  const dates = useMemo(() => {
    return Array.from({ length: 14 }).map((_, idx) => {
      const date = new Date();
      date.setDate(date.getDate() + idx);
      return date;
    });
  }, []);

  const filtered = useMemo(() => {
    if (!selectedDate) return tasks;
    return tasks.filter((task) => task.dueDate?.startsWith(selectedDate));
  }, [tasks, selectedDate]);

  // Считаем задачи на каждую дату для бейджей
  const dateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      if (task.dueDate) {
        const day = task.dueDate.slice(0, 10);
        counts[day] = (counts[day] || 0) + 1;
      }
    }
    return counts;
  }, [tasks]);

  return (
    <section className="space-y-4 pt-4">
      <h1 className="text-lg font-semibold text-white">{t(language, "calendarTitle")}</h1>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <Button
          variant={selectedDate === null ? "default" : "outline"}
          className="shrink-0"
          onClick={() => setSelectedDate(null)}
        >
          {t(language, "all")} ({tasks.length})
        </Button>
        {dates.map((date) => {
          const iso = isoDateOnly(date);
          const active = selectedDate === iso;
          const count = dateCounts[iso] || 0;
          return (
            <Button
              key={iso}
              variant={active ? "default" : "outline"}
              className="shrink-0 gap-1"
              onClick={() => setSelectedDate(iso)}
            >
              {date.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", {
                month: "short",
                day: "numeric",
              })}
              {count > 0 && (
                <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] leading-none">
                  {count}
                </span>
              )}
            </Button>
          );
        })}
      </div>
      <div className="space-y-2 pb-8">
        {filtered.length ? (
          filtered.map((task) => <TaskCard key={task.id} task={task} />)
        ) : (
          <Card className="text-xs text-slate-500">{t(language, "noTasksOnDate")}</Card>
        )}
      </div>
    </section>
  );
}
