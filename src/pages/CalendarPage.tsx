import { useState, useMemo } from "react";
import { useTaskStore } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const WEEKDAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "high": return "#ef4444";
    case "medium": return "#f59e0b";
    case "low": return "#22c55e";
    default: return "#94a3b8";
  }
}

export default function CalendarPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const toggleTaskStatus = useTaskStore((state) => state.toggleTaskStatus);

  const ru = language === "ru";
  const weekdays = ru ? WEEKDAYS_RU : WEEKDAYS_EN;
  const months = ru ? MONTHS_RU : MONTHS_EN;

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    today.toISOString().split("T")[0]
  );

  const daysInMonth = useMemo(() => {
    const days: (number | null)[] = [];
    const firstDay = new Date(currentYear, currentMonth, 1);
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

    for (let i = 0; i < startWeekday; i++) days.push(null);

    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let i = 1; i <= totalDays; i++) days.push(i);

    return days;
  }, [currentYear, currentMonth]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, number> = {};
    tasks.forEach((task) => {
      if (task.dueDate) {
        const dateStr = task.dueDate.split("T")[0];
        map[dateStr] = (map[dateStr] || 0) + 1;
      }
    });
    return map;
  }, [tasks]);

  const selectedTasks = useMemo(() => {
    return tasks.filter((task) => task.dueDate?.startsWith(selectedDate));
  }, [tasks, selectedDate]);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const todayStr = today.toISOString().split("T")[0];

  return (
    <div
      style={{
        minHeight: "100vh",
        paddingBottom: "100px",
        paddingTop: "8px",
      }}
    >
      {/* Заголовок */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          padding: "0 4px",
        }}
      >
        <button
          onClick={prevMonth}
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "none",
            borderRadius: "10px",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "white",
          }}
        >
          <ChevronLeft size={20} />
        </button>

        <div style={{ textAlign: "center" }}>
          <p
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "white",
              margin: 0,
            }}
          >
            {months[currentMonth]}
          </p>
          <p
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.5)",
              margin: 0,
            }}
          >
            {currentYear}
          </p>
        </div>

        <button
          onClick={nextMonth}
          style={{
            background: "rgba(255,255,255,0.1)",
            border: "none",
            borderRadius: "10px",
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "white",
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Дни недели */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          marginBottom: "8px",
          gap: "2px",
        }}
      >
        {weekdays.map((day) => (
          <div
            key={day}
            style={{
              textAlign: "center",
              fontSize: "11px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.4)",
              paddingBottom: "4px",
            }}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Сетка дней */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: "4px",
          marginBottom: "16px",
        }}
      >
        {daysInMonth.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} />;
          }

          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const taskCount = tasksByDate[dateStr] || 0;

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              style={{
                position: "relative",
                height: "40px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                backgroundColor: isSelected
                  ? "#3b82f6"
                  : isToday
                  ? "rgba(59,130,246,0.2)"
                  : "rgba(255,255,255,0.05)",
                transition: "all 0.15s ease",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: isToday || isSelected ? 700 : 400,
                  color: isSelected
                    ? "white"
                    : isToday
                    ? "#3b82f6"
                    : "rgba(255,255,255,0.85)",
                }}
              >
                {day}
              </span>
              {taskCount > 0 && (
                <div
                  style={{
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: isSelected ? "white" : "#3b82f6",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Задачи выбранного дня */}
      <div>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.6)",
            marginBottom: "10px",
          }}
        >
          {selectedDate === todayStr
            ? ru ? "Сегодня" : "Today"
            : new Date(selectedDate).toLocaleDateString(
                ru ? "ru-RU" : "en-US",
                { day: "numeric", month: "long" }
              )}
          {" "}
          <span style={{ color: "rgba(255,255,255,0.3)" }}>
            ({selectedTasks.length})
          </span>
        </p>

        {selectedTasks.length === 0 ? (
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              borderRadius: "14px",
              padding: "20px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)", margin: 0 }}>
              {ru ? "Нет задач на этот день" : "No tasks for this day"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {selectedTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => toggleTaskStatus(task.id)}
                style={{
                  backgroundColor: "rgba(255,255,255,0.07)",
                  borderRadius: "14px",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.08)",
                  opacity: task.status === "done" ? 0.5 : 1,
                  transition: "opacity 0.2s ease",
                }}
              >
                {/* Чекбокс */}
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    minWidth: "20px",
                    borderRadius: "50%",
                    border: `2px solid ${task.status === "done" ? "#3b82f6" : "rgba(255,255,255,0.3)"}`,
                    backgroundColor: task.status === "done" ? "#3b82f6" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                  }}
                >
                  {task.status === "done" && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </div>

                {/* Контент */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color: task.status === "done"
                        ? "rgba(255,255,255,0.4)"
                        : "rgba(255,255,255,0.95)",
                      textDecoration: task.status === "done" ? "line-through" : "none",
                      margin: 0,
                      marginBottom: "2px",
                      wordBreak: "break-word",
                    }}
                  >
                    {task.title}
                  </p>
                  {task.dueDate && (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={11} color="rgba(255,255,255,0.4)" />
                      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                        {formatTime(task.dueDate)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Приоритет */}
                <div
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: getPriorityColor(task.priority),
                    flexShrink: 0,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
