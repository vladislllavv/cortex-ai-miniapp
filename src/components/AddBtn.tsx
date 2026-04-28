import { useState } from "react";
import { Plus } from "lucide-react";
import { triggerHaptic } from "@/lib/telegram";
import { t, useI18nStore } from "@/lib/i18n";
import { TaskPriority, useTaskStore, checkSubscription } from "@/lib/store";

const priorityOptions = [
  { value: "low" as TaskPriority, emoji: "🟢" },
  { value: "medium" as TaskPriority, emoji: "🟡" },
  { value: "high" as TaskPriority, emoji: "🔴" },
];

export default function AddBtn() {
  const language = useI18nStore((state) => state.language);
  const addTask = useTaskStore((state) => state.addTask);
  const tasks = useTaskStore((state) => state.tasks);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [repeat, setRepeat] = useState(false);

  const ru = language === "ru";

  const resetForm = () => {
    setTitle("");
    setDate("");
    setTime("");
    setPriority("medium");
    setRepeat(false);
    setStep(1);
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(resetForm, 200);
  };

  const handleNext = () => {
    if (!title.trim()) return;
    triggerHaptic("light");
    setStep(2);
  };

  const handleBack = () => {
    triggerHaptic("light");
    setStep(1);
  };

  const onSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    if (tasks.length >= 5) {
      const userId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
      const hasSub = userId ? await checkSubscription(String(userId)) : false;

      if (!hasSub) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.showAlert(
          ru
            ? "У тебя уже 5 задач 📋\n\nНужна подписка (100 Stars/мес).\n\nНапиши боту /subscribe"
            : "You have 5 tasks 📋\n\nSubscription needed (100 Stars/mo).\n\nSend /subscribe to the bot"
        );
        tg?.openTelegramLink("https://t.me/aiplannerrubot");
        handleClose();
        return;
      }
    }

    let dueDate: string | undefined;

    if (date && time) {
      const p = new Date(`${date}T${time}:00`);
      if (!isNaN(p.getTime())) dueDate = p.toISOString();
    } else if (date) {
      const p = new Date(`${date}T09:00:00`);
      if (!isNaN(p.getTime())) dueDate = p.toISOString();
    }

    addTask({
      title: trimmed,
      dueDate,
      priority,
      status: "todo",
      isAiCreated: false,
      repeat: repeat ? "daily" : "none",
    });

    triggerHaptic("success");
    handleClose();
  };

  if (!open) {
    return (
      <button
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-2xl active:scale-95 transition-transform"
        aria-label="Add task"
        onClick={() => {
          triggerHaptic("light");
          setOpen(true);
        }}
      >
        <Plus className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "280px",
          minHeight: "280px",
        }}
        className="rounded-2xl bg-white shadow-2xl overflow-hidden transition-all duration-200"
      >
        {/* Контент с фиксированными отступами */}
        <div className="p-4">

          {/* Индикатор шагов */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-medium text-slate-400">
              {ru ? `Шаг ${step}/2` : `Step ${step}/2`}
            </span>
            <div className="flex gap-1">
              <div
                className="h-1 w-6 rounded-full transition-colors duration-300"
                style={{ backgroundColor: step >= 1 ? "#3b82f6" : "#e2e8f0" }}
              />
              <div
                className="h-1 w-6 rounded-full transition-colors duration-300"
                style={{ backgroundColor: step >= 2 ? "#3b82f6" : "#e2e8f0" }}
              />
            </div>
          </div>

          {/* ============ ШАГ 1 ============ */}
          {step === 1 && (
            <div>
              <p className="text-sm font-bold text-slate-900 mb-3">
                {ru ? "Что нужно сделать?" : "What to do?"}
              </p>

              {/* Название */}
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNext()}
                placeholder={ru ? "Название задачи..." : "Task title..."}
                style={{
                  display: "block",
                  width: "100%",
                  boxSizing: "border-box",
                  height: "40px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                  paddingLeft: "12px",
                  paddingRight: "12px",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  marginBottom: "12px",
                }}
              />

              {/* Приоритет */}
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#94a3b8",
                  marginBottom: "6px",
                }}
              >
                {ru ? "Приоритет" : "Priority"}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "6px",
                  marginBottom: "16px",
                }}
              >
                {priorityOptions.map(({ value, emoji }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPriority(value)}
                    style={{
                      height: "36px",
                      borderRadius: "12px",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: 500,
                      cursor: "pointer",
                      backgroundColor: priority === value ? "#3b82f6" : "#f1f5f9",
                      color: priority === value ? "#ffffff" : "#475569",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {emoji} {t(language, value)}
                  </button>
                ))}
              </div>

              {/* Кнопки */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleClose}
                  style={{
                    flex: 1,
                    height: "40px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#64748b",
                    cursor: "pointer",
                  }}
                >
                  {ru ? "Отмена" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!title.trim()}
                  style={{
                    flex: 1,
                    height: "40px",
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: title.trim() ? "#3b82f6" : "#94a3b8",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#ffffff",
                    cursor: title.trim() ? "pointer" : "default",
                    opacity: title.trim() ? 1 : 0.5,
                    transition: "all 0.15s ease",
                  }}
                >
                  {ru ? "Далее →" : "Next →"}
                </button>
              </div>
            </div>
          )}

          {/* ============ ШАГ 2 ============ */}
          {step === 2 && (
            <div>
              <p className="text-sm font-bold text-slate-900 mb-3">
                {ru ? "Когда напомнить?" : "When to remind?"}
              </p>

              {/* Дата */}
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#94a3b8",
                  marginBottom: "4px",
                }}
              >
                {ru ? "Дата" : "Date"}
              </p>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  boxSizing: "border-box",
                  height: "40px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                  paddingLeft: "12px",
                  paddingRight: "12px",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  marginBottom: "10px",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  appearance: "none",
                }}
              />

              {/* Время */}
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#94a3b8",
                  marginBottom: "4px",
                }}
              >
                {ru ? "Время" : "Time"}
              </p>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{
                  display: "block",
                  width: "100%",
                  boxSizing: "border-box",
                  height: "40px",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#f8fafc",
                  paddingLeft: "12px",
                  paddingRight: "12px",
                  fontSize: "14px",
                  color: "#1e293b",
                  outline: "none",
                  marginBottom: "10px",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                  appearance: "none",
                }}
              />

              {/* Повтор */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#f8fafc",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b" }}>
                    🔁 {ru ? "Каждый день" : "Daily"}
                  </p>
                </div>
                <div
                  onClick={() => setRepeat(!repeat)}
                  style={{
                    position: "relative",
                    width: "44px",
                    height: "24px",
                    minWidth: "44px",
                    borderRadius: "12px",
                    backgroundColor: repeat ? "#3b82f6" : "#cbd5e1",
                    cursor: "pointer",
                    transition: "background-color 0.2s ease",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: "2px",
                      left: repeat ? "22px" : "2px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      backgroundColor: "#ffffff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      transition: "left 0.2s ease",
                    }}
                  />
                </div>
              </div>

              {/* Кнопки */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={handleBack}
                  style={{
                    width: "44px",
                    minWidth: "44px",
                    height: "40px",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    backgroundColor: "#ffffff",
                    fontSize: "16px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  style={{
                    flex: 1,
                    height: "40px",
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: "#3b82f6",
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  {ru ? "Создать ✅" : "Create ✅"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
