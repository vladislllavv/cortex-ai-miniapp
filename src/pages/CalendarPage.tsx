import { useState, useMemo } from "react";
import {
  useTaskStore,
  RUSSIAN_HOLIDAYS,
  isWeekend,
  isHoliday,
  getHolidayName,
  Birthday,
  Vacation,
} from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { ChevronLeft, ChevronRight, Clock, Plus, Trash2, X } from "lucide-react";

const WEEKDAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function ColorPicker({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors?: string[] }) {
  const defaultColors = ["#3b82f6", "#ef4444", "#f59e0b", "#22c55e", "#a855f7", "#ec4899"];
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      {(colors || defaultColors).map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: color, border: value === color ? "3px solid white" : "2px solid transparent", cursor: "pointer" }}
        />
      ))}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#1e293b", borderRadius: "20px", padding: "20px", width: "100%", maxWidth: "320px", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <p style={{ fontSize: "15px", fontWeight: 700, color: "white", margin: 0 }}>{title}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)" }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <p style={{ fontSize: "11px", fontWeight: 500, color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>{label}</p>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", boxSizing: "border-box" as const,
  height: "40px", borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.1)",
  backgroundColor: "rgba(255,255,255,0.07)",
  paddingLeft: "12px", paddingRight: "12px",
  fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit",
};

const saveButtonStyle: React.CSSProperties = {
  width: "100%", height: "42px", borderRadius: "12px", border: "none",
  backgroundColor: "#3b82f6", fontSize: "14px", fontWeight: 600,
  color: "white", cursor: "pointer", marginTop: "4px",
};

export default function CalendarPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const toggleTaskStatus = useTaskStore((state) => state.toggleTaskStatus);
  const birthdays = useTaskStore((state) => state.birthdays);
  const vacations = useTaskStore((state) => state.vacations);
  const addBirthday = useTaskStore((state) => state.addBirthday);
  const deleteBirthday = useTaskStore((state) => state.deleteBirthday);
  const addVacation = useTaskStore((state) => state.addVacation);
  const deleteVacation = useTaskStore((state) => state.deleteVacation);

  const ru = language === "ru";
  const months = ru ? MONTHS_RU : MONTHS_EN;

  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(today.toISOString().split("T")[0]);
  const [showAddBirthday, setShowAddBirthday] = useState(false);
  const [showAddVacation, setShowAddVacation] = useState(false);
  const [showPanel, setShowPanel] = useState<"none" | "birthdays" | "vacations">("none");

  const [bdName, setBdName] = useState("");
  const [bdDate, setBdDate] = useState("");
  const [bdColor, setBdColor] = useState("#3b82f6");
  const [vacTitle, setVacTitle] = useState("");
  const [vacStart, setVacStart] = useState("");
  const [vacEnd, setVacEnd] = useState("");
  const [vacColor, setVacColor] = useState("#22c55e");

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

  const selectedTasks = useMemo(() =>
    tasks.filter((task) => task.dueDate?.startsWith(selectedDate)),
    [tasks, selectedDate]
  );

  const todayStr = today.toISOString().split("T")[0];

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(todayStr);
  };

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1); }
    else setCurrentMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1); }
    else setCurrentMonth((m) => m + 1);
  };

  const handleAddBirthday = async () => {
    if (!bdName.trim() || !bdDate) return;
    const [, month, day] = bdDate.split("-");
    await addBirthday({ name: bdName.trim(), date: `${month}-${day}`, color: bdColor });
    setBdName(""); setBdDate(""); setBdColor("#3b82f6");
    setShowAddBirthday(false);
  };

  const handleAddVacation = async () => {
    if (!vacTitle.trim() || !vacStart || !vacEnd) return;
    await addVacation({ title: vacTitle.trim(), startDate: vacStart, endDate: vacEnd, color: vacColor });
    setVacTitle(""); setVacStart(""); setVacEnd(""); setVacColor("#22c55e");
    setShowAddVacation(false);
  };

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "20px" }}>

      {/* Заголовок */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <button onClick={prevMonth} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "10px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ChevronLeft size={18} color="white" />
        </button>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "18px", fontWeight: 700, color: "white", margin: 0 }}>{months[currentMonth]}</p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{currentYear}</p>
        </div>

        <button onClick={nextMonth} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "10px", width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ChevronRight size={18} color="white" />
        </button>
      </div>

      {/* Кнопки управления */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
        {/* Кнопка Сегодня */}
        <button
          onClick={goToToday}
          style={{
            padding: "6px 12px", borderRadius: "20px",
            border: "1px solid rgba(59,130,246,0.4)",
            backgroundColor: "rgba(59,130,246,0.15)",
            color: "#60a5fa", fontSize: "12px", cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {ru ? "📅 Сегодня" : "📅 Today"}
        </button>

        {[
          { id: "birthdays" as const, icon: "🎂", label: ru ? "ДР" : "BD" },
          { id: "vacations" as const, icon: "🌴", label: ru ? "Отпуск" : "Vacation" },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setShowPanel(showPanel === id ? "none" : id)}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "6px 12px", borderRadius: "20px",
              border: showPanel === id ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)",
              backgroundColor: showPanel === id ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
              color: showPanel === id ? "#60a5fa" : "rgba(255,255,255,0.6)",
              fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Панели */}
      {showPanel === "birthdays" && (
        <div style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "white", margin: 0 }}>🎂 {ru ? "Дни рождения" : "Birthdays"}</p>
            <button onClick={() => setShowAddBirthday(true)} style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#3b82f6", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus size={14} color="white" />
            </button>
          </div>
          {birthdays.length === 0
            ? <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", margin: 0 }}>{ru ? "Нет дней рождения" : "No birthdays"}</p>
            : birthdays.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: b.color, flexShrink: 0 }} />
                <span style={{ fontSize: "13px", color: "white", flex: 1 }}>{b.name}</span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>{b.date}</span>
                <button onClick={() => deleteBirthday(b.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}>
                  <Trash2 size={12} color="#ef4444" />
                </button>
              </div>
            ))}
        </div>
      )}

      {showPanel === "vacations" && (
        <div style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "white", margin: 0 }}>🌴 {ru ? "Отпуска" : "Vacations"}</p>
            <button onClick={() => setShowAddVacation(true)} style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "#22c55e", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Plus size={14} color="white" />
            </button>
          </div>
          {vacations.length === 0
            ? <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", margin: 0 }}>{ru ? "Нет отпусков" : "No vacations"}</p>
            : vacations.map((v) => (
              <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: v.color, flexShrink: 0 }} />
                <span style={{ fontSize: "13px", color: "white", flex: 1 }}>{v.title}</span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{v.startDate} — {v.endDate}</span>
                <button onClick={() => deleteVacation(v.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}>
                  <Trash2 size={12} color="#ef4444" />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Легенда */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "10px", flexWrap: "wrap" }}>
        {[
          { color: "#ef4444", label: ru ? "Праздник" : "Holiday" },
          { color: "#3b82f6", label: ru ? "Сегодня" : "Today" },
          { color: "#22c55e", label: ru ? "Отпуск" : "Vacation" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "3px", backgroundColor: color }} />
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Дни недели */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "4px" }}>
        {WEEKDAYS_RU.map((day, i) => (
          <div key={day} style={{ textAlign: "center", fontSize: "11px", fontWeight: 600, color: i >= 5 ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.35)", paddingBottom: "4px" }}>
            {day}
          </div>
        ))}
      </div>

      {/* Сетка дней */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "3px", marginBottom: "16px" }}>
        {daysInMonth.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;

          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const holiday = isHoliday(dateStr);
          const weekend = isWeekend(dateStr);
          const taskCount = tasksByDate[dateStr] || 0;

          const month = dateStr.slice(5, 7);
          const dayPart = dateStr.slice(8, 10);
          const isBirthday = birthdays.some((b) => b.date === `${month}-${dayPart}`);
          const isVacation = vacations.some((v) => dateStr >= v.startDate && dateStr <= v.endDate);

          let bgColor = "rgba(255,255,255,0.04)";
          let textColor = "rgba(255,255,255,0.85)";
          let borderColor = "transparent";

          if (isSelected) { bgColor = "#1d4ed8"; textColor = "white"; borderColor = "#3b82f6"; }
          else if (isToday) { bgColor = "#2563eb"; textColor = "white"; borderColor = "#60a5fa"; }
          else if (holiday) { bgColor = "rgba(239,68,68,0.25)"; textColor = "#fca5a5"; borderColor = "rgba(239,68,68,0.4)"; }
          else if (weekend) { bgColor = "rgba(239,68,68,0.12)"; textColor = "#fca5a5"; borderColor = "rgba(239,68,68,0.2)"; }
          else if (isVacation) { bgColor = "rgba(34,197,94,0.15)"; textColor = "#86efac"; borderColor = "rgba(34,197,94,0.2)"; }
          else if (isBirthday) { bgColor = "rgba(59,130,246,0.15)"; textColor = "#93c5fd"; borderColor = "rgba(59,130,246,0.2)"; }

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              style={{ height: "40px", borderRadius: "8px", border: `1px solid ${borderColor}`, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px", backgroundColor: bgColor, transition: "all 0.15s ease" }}
            >
              <span style={{ fontSize: "13px", fontWeight: isToday || isSelected ? 700 : 400, color: textColor }}>
                {day}
              </span>
              <div style={{ display: "flex", gap: "2px" }}>
                {taskCount > 0 && <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: isSelected || isToday ? "white" : "#60a5fa" }} />}
                {isBirthday && !isSelected && !isToday && <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "#3b82f6" }} />}
                {isVacation && !isSelected && <div style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: "#22c55e" }} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Информация о выбранном дне */}
      {(isHoliday(selectedDate) || birthdays.some((b) => {
        const m = selectedDate.slice(5, 7);
        const d = selectedDate.slice(8, 10);
        return b.date === `${m}-${d}`;
      })) && (
        <div style={{ marginBottom: "12px" }}>
          {isHoliday(selectedDate) && (
            <div style={{ backgroundColor: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "8px 12px", marginBottom: "6px" }}>
              <p style={{ fontSize: "12px", color: "#fca5a5", margin: 0 }}>🎉 {getHolidayName(selectedDate)}</p>
            </div>
          )}
          {birthdays.filter((b) => {
            const m = selectedDate.slice(5, 7);
            const d = selectedDate.slice(8, 10);
            return b.date === `${m}-${d}`;
          }).map((b) => (
            <div key={b.id} style={{ backgroundColor: `${b.color}15`, border: `1px solid ${b.color}30`, borderRadius: "10px", padding: "8px 12px", marginBottom: "6px" }}>
              <p style={{ fontSize: "12px", color: b.color, margin: 0 }}>🎂 {ru ? "День рождения" : "Birthday"}: {b.name}</p>
            </div>
          ))}
        </div>
      )}

      {/* Задачи выбранного дня */}
      <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: "8px" }}>
        {selectedDate === todayStr
          ? (ru ? "Сегодня" : "Today")
          : new Date(selectedDate + "T12:00:00").toLocaleDateString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "long" })}
        {" "}<span style={{ color: "rgba(255,255,255,0.25)" }}>({selectedTasks.length})</span>
      </p>

      {selectedTasks.length === 0 ? (
        <div style={{ backgroundColor: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "16px", textAlign: "center", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.25)", margin: 0 }}>
            {ru ? "Нет задач на этот день" : "No tasks for this day"}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {selectedTasks.map((task) => (
            <div key={task.id} onClick={() => toggleTaskStatus(task.id)} style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "12px", padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.07)", opacity: task.status === "done" ? 0.5 : 1 }}>
              <div style={{ width: "20px", height: "20px", minWidth: "20px", borderRadius: "50%", border: `2px solid ${task.status === "done" ? "#3b82f6" : "rgba(255,255,255,0.25)"}`, backgroundColor: task.status === "done" ? "#3b82f6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {task.status === "done" && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "14px", fontWeight: 500, margin: "0 0 2px 0", color: task.status === "done" ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.9)", textDecoration: task.status === "done" ? "line-through" : "none", wordBreak: "break-word" }}>
                  {task.title}
                </p>
                {task.dueDate && (
                  <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                    <Clock size={11} color="rgba(255,255,255,0.35)" />
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>{formatTime(task.dueDate)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модалки */}
      {showAddBirthday && (
        <Modal title={`🎂 ${ru ? "День рождения" : "Birthday"}`} onClose={() => setShowAddBirthday(false)}>
          <ModalField label={ru ? "Имя" : "Name"}>
            <input value={bdName} onChange={(e) => setBdName(e.target.value)} placeholder={ru ? "Имя человека" : "Person's name"} style={inputStyle} />
          </ModalField>
          <ModalField label={ru ? "Дата" : "Date"}>
            <input type="date" value={bdDate} onChange={(e) => setBdDate(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          </ModalField>
          <ModalField label={ru ? "Цвет" : "Color"}>
            <ColorPicker value={bdColor} onChange={setBdColor} />
          </ModalField>
          <button onClick={handleAddBirthday} style={saveButtonStyle}>{ru ? "Сохранить" : "Save"}</button>
        </Modal>
      )}

      {showAddVacation && (
        <Modal title={`🌴 ${ru ? "Отпуск" : "Vacation"}`} onClose={() => setShowAddVacation(false)}>
          <ModalField label={ru ? "Название" : "Title"}>
            <input value={vacTitle} onChange={(e) => setVacTitle(e.target.value)} placeholder={ru ? "Например: Отпуск в Сочи" : "E.g. Vacation in Italy"} style={inputStyle} />
          </ModalField>
          <ModalField label={ru ? "Начало" : "Start"}>
            <input type="date" value={vacStart} onChange={(e) => setVacStart(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          </ModalField>
          <ModalField label={ru ? "Конец" : "End"}>
            <input type="date" value={vacEnd} onChange={(e) => setVacEnd(e.target.value)} style={{ ...inputStyle, colorScheme: "dark" }} />
          </ModalField>
          <ModalField label={ru ? "Цвет" : "Color"}>
            <ColorPicker value={vacColor} onChange={setVacColor} colors={["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"]} />
          </ModalField>
          <button onClick={handleAddVacation} style={saveButtonStyle}>{ru ? "Сохранить" : "Save"}</button>
        </Modal>
      )}
    </div>
  );
}
