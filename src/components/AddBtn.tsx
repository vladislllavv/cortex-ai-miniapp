import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { triggerHaptic } from "@/lib/telegram";
import { t, useI18nStore } from "@/lib/i18n";
import {
  TaskPriority,
  useTaskStore,
  checkSubscription,
  getTelegramUserId,
} from "@/lib/store";

const priorityOptions = [
  { value: "low" as TaskPriority, emoji: "🟢" },
  { value: "medium" as TaskPriority, emoji: "🟡" },
  { value: "high" as TaskPriority, emoji: "🔴" },
];

export default function AddBtn() {
  const language = useI18nStore((state) => state.language);
  const addTask = useTaskStore((state) => state.addTask);
  const tasks = useTaskStore((state) => state.tasks);
  const ru = language === "ru";

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [repeat, setRepeat] = useState(false);
  const [saving, setSaving] = useState(false);

  // Защита от двойного нажатия
  const savingRef = useRef(false);

  const resetForm = () => {
    setTitle("");
    setDate("");
    setTime("");
    setPriority("medium");
    setRepeat(false);
    setStep(1);
    setSaving(false);
    savingRef.current = false;
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
    // Защита от двойного нажатия
    if (savingRef.current) return;
    const trimmed = title.trim();
    if (!trimmed) return;

    savingRef.current = true;
    setSaving(true);

    try {
      // Проверка лимита задач за сегодня
      const todayStr = new Date().toISOString().split("T")[0];
      const todayTasks = tasks.filter(
        (t) => t.createdAt.startsWith(todayStr)
      );

      if (todayTasks.length >= 5) {
        const userId = getTelegramUserId();
        const hasSub = userId !== "unknown"
          ? await checkSubscription(userId)
          : false;

        if (!hasSub) {
          const tg = (window as any).Telegram?.WebApp;
          tg?.showAlert(
            ru
              ? "Лимит 5 задач в день исчерпан 📋\n\nОформи подписку (100 Stars/мес) для неограниченного доступа.\n\nНапиши боту /subscribe"
              : "Daily limit of 5 tasks reached 📋\n\nGet subscription (100 Stars/mo) for unlimited access.\n\nSend /subscribe to bot"
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

      // Мгновенное добавление
      await addTask({
        title: trimmed,
        dueDate,
        priority,
        status: "todo",
        isAiCreated: false,
        repeat: repeat ? "daily" : "none",
      });

      triggerHaptic("success");
      handleClose();
    } catch (err) {
      console.error("Save error:", err);
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        style={{
          position: "fixed",
          bottom: "90px",
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
          boxShadow: "0 4px 20px rgba(59,130,246,0.5)",
          transition: "transform 0.15s ease",
          WebkitTapHighlightColor: "transparent",
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
        backgroundColor: "rgba(0,0,0,0.6)",
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
          width: "100%",
          maxWidth: "320px",
          backgroundColor: "#1e293b",
          borderRadius: "20px",
          padding: "20px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          boxSizing: "border-box",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Индикатор шагов */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
          }}
        >
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
            {ru ? `Шаг ${step}/2` : `Step ${step}/2`}
          </span>
          <div style={{ display: "flex", gap: "4px" }}>
            {[1, 2].map((s) => (
              <div
                key={s}
                style={{
                  height: "3px",
                  width: "28px",
                  borderRadius: "2px",
                  backgroundColor: step >= s ? "#3b82f6" : "rgba(255,255,255,0.15)",
                  transition: "background-color 0.3s ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* ШАГ 1 */}
        {step === 1 && (
          <div>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "white", marginBottom: "14px" }}>
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
                height: "44px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.07)",
                paddingLeft: "14px",
                paddingRight: "14px",
                fontSize: "15px",
                color: "white",
                outline: "none",
                marginBottom: "14px",
                fontFamily: "inherit",
              }}
            />

            <p style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: "8px" }}>
              {ru ? "Приоритет" : "Priority"}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "8px",
                marginBottom: "16px",
              }}
            >
              {priorityOptions.map(({ value, emoji }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  style={{
                    height: "38px",
                    borderRadius: "10px",
                    border: priority === value ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)",
                    fontSize: "12px",
                    fontWeight: 500,
                    cursor: "pointer",
                    backgroundColor: priority === value ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                    color: priority === value ? "#60a5fa" : "rgba(255,255,255,0.5)",
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
                  height: "44px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "transparent",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.5)",
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
                  height: "44px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor: title.trim() ? "#3b82f6" : "rgba(255,255,255,0.1)",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "white",
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
            <p style={{ fontSize: "16px", fontWeight: 700, color: "white", marginBottom: "14px" }}>
              {ru ? "Когда напомнить?" : "When to remind?"}
            </p>

            <p style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>
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
                height: "44px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.07)",
                paddingLeft: "14px",
                paddingRight: "14px",
                fontSize: "15px",
                color: "white",
                outline: "none",
                marginBottom: "12px",
                appearance: "none",
                WebkitAppearance: "none",
                fontFamily: "inherit",
                colorScheme: "dark",
              }}
            />

            <p style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.4)", marginBottom: "6px" }}>
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
                height: "44px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.07)",
                paddingLeft: "14px",
                paddingRight: "14px",
                fontSize: "15px",
                color: "white",
                outline: "none",
                marginBottom: "12px",
                appearance: "none",
                WebkitAppearance: "none",
                fontFamily: "inherit",
                colorScheme: "dark",
              }}
            />

            {/* Повтор */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "rgba(255,255,255,0.05)",
                borderRadius: "12px",
                padding: "12px 14px",
                marginBottom: "16px",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255,255,255,0.8)", margin: 0 }}>
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
                  backgroundColor: repeat ? "#3b82f6" : "rgba(255,255,255,0.15)",
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
                    backgroundColor: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
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
                  width: "44px",
                  minWidth: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "transparent",
                  fontSize: "18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                ←
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                style={{
                  flex: 1,
                  height: "44px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor: saving ? "rgba(59,130,246,0.5)" : "#3b82f6",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "white",
                  cursor: saving ? "default" : "pointer",
                  transition: "background-color 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                {saving
                  ? (ru ? "Сохраняю..." : "Saving...")
                  : (ru ? "Создать ✅" : "Create ✅")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
