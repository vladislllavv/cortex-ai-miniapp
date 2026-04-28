import { useState, useEffect } from "react";
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

  // Фикс скачков при появлении/скрытии клавиатуры
  useEffect(() => {
    if (!open) return;

    const originalHeight = window.innerHeight;

    const handleResize = () => {
      const currentHeight = window.innerHeight;
      const diff = originalHeight - currentHeight;

      // Если клавиатура появилась — поднимаем контент
      if (diff > 100) {
        document.body.style.transform = `translateY(-${diff / 3}px)`;
      } else {
        document.body.style.transform = "translateY(0)";
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      document.body.style.transform = "translateY(0)";
    };
  }, [open]);

  const resetForm = () => {
    setTitle("");
    setDate("");
    setTime("");
    setPriority("medium");
    setRepeat(false);
    setStep(1);
  };

  const handleClose = () => {
    document.body.style.transform = "translateY(0)";
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
            : "You have 5 tasks 📋\n\nSubscription needed.\n\nSend /subscribe to bot"
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
        style={{
          position: "fixed",
          bottom: "96px",
          right: "16px",
          zIndex: 40,
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          backgroundColor: "#3b82f6",
          color: "white",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px rgba(59,130,246,0.4)",
          transition: "transform 0.15s ease",
        }}
        onClick={() => {
          triggerHaptic("light");
          setOpen(true);
        }}
      >
        <Plus size={24} />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "280px",
          backgroundColor: "#ffffff",
          borderRadius: "20px",
          padding: "16px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          boxSizing: "border-box",
        }}
      >
        {/* Индикатор шагов */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>
            {ru ? `Шаг ${step}/2` : `Step ${step}/2`}
          </span>
          <div style={{ display: "flex", gap: "4px" }}>
            {[1, 2].map((s) => (
              <div
                key={s}
                style={{
                  height: "3px",
                  width: "24px",
                  borderRadius: "2px",
                  backgroundColor: step >= s ? "#3b82f6" : "#e2e8f0",
                  transition: "background-color 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* ШАГ 1 */}
        {step === 1 && (
          <div>
            <p
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: "12px",
              }}
            >
              {ru ? "Что нужно сделать?" : "What to do?"}
            </p>

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
                height: "42px",
                borderRadius: "12px",
                border: "1.5px solid #e2e8f0",
                backgroundColor: "#f8fafc",
                paddingLeft: "12px",
                paddingRight: "12px",
                fontSize: "14px",
                color: "#1e293b",
                outline: "none",
                marginBottom: "12px",
              }}
            />

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
                marginBottom: "14px",
              }}
            >
              {priorityOptions.map(({ value, emoji }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  style={{
                    height: "36px",
                    borderRadius: "10px",
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

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  flex: 1,
                  height: "40px",
                  borderRadius: "12px",
                  border: "1.5px solid #e2e8f0",
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
                  backgroundColor: title.trim() ? "#3b82f6" : "#cbd5e1",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#ffffff",
                  cursor: title.trim() ? "pointer" : "default",
                  transition: "background-color 0.2s ease",
                }}
              >
                {ru ? "Далее →" : "Next →"}
              </button>
            </div>
          </div>
        )}

        {/* ШАГ 2 */}
        {step === 2 && (
          <div>
            <p
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "#0f172a",
                marginBottom: "12px",
              }}
            >
              {ru ? "Когда напомнить?" : "When to remind?"}
            </p>

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
                height: "42px",
                borderRadius: "12px",
                border: "1.5px solid #e2e8f0",
                backgroundColor: "#f8fafc",
                paddingLeft: "12px",
                paddingRight: "12px",
                fontSize: "14px",
                color: "#1e293b",
                outline: "none",
                marginBottom: "10px",
                appearance: "none",
                WebkitAppearance: "none",
              }}
            />

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
                height: "42px",
                borderRadius: "12px",
                border: "1.5px solid #e2e8f0",
                backgroundColor: "#f8fafc",
                paddingLeft: "12px",
                paddingRight: "12px",
                fontSize: "14px",
                color: "#1e293b",
                outline: "none",
                marginBottom: "10px",
                appearance: "none",
                WebkitAppearance: "none",
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
                boxSizing: "border-box",
              }}
            >
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#1e293b",
                  margin: 0,
                }}
              >
                🔁 {ru ? "Каждый день" : "Daily"}
              </p>

              <div
                onClick={() => setRepeat(!repeat)}
                style={{
                  position: "relative",
                  width: "44px",
                  minWidth: "44px",
                  height: "24px",
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

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={handleBack}
                style={{
                  width: "42px",
                  minWidth: "42px",
                  height: "40px",
                  borderRadius: "12px",
                  border: "1.5px solid #e2e8f0",
                  backgroundColor: "#ffffff",
                  fontSize: "16px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#64748b",
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
  );
}
