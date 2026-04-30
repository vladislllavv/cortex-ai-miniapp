import { useState, useRef } from "react";
import { Plus, ShoppingCart, CheckSquare, ArrowLeft } from "lucide-react";
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
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [taskType, setTaskType] = useState<"task" | "shopping">("task");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [repeat, setRepeat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shoppingItems, setShoppingItems] = useState<string[]>([""]);
  const savingRef = useRef(false);

  const resetForm = () => {
    setTitle("");
    setDate("");
    setTime("");
    setPriority("medium");
    setRepeat(false);
    setStep(0);
    setTaskType("task");
    setSaving(false);
    setShoppingItems([""]);
    savingRef.current = false;
  };

  const handleClose = () => {
    setOpen(false);
    setTimeout(resetForm, 200);
  };

  const handleSelectType = (type: "task" | "shopping") => {
    setTaskType(type);
    triggerHaptic("light");
    setStep(1);
  };

  const handleNext = () => {
    if (taskType === "task" && !title.trim()) return;
    if (taskType === "shopping" && !shoppingItems.some((i) => i.trim())) return;
    triggerHaptic("light");
    setStep(2);
  };

  const handleBack = () => {
    triggerHaptic("light");
    if (step === 2) setStep(1);
    else if (step === 1) setStep(0);
  };

  const onSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const todayTasks = tasks.filter((t) => t.createdAt.startsWith(todayStr));

      if (todayTasks.length >= 5) {
        const userId = getTelegramUserId();
        const hasSub = userId !== "unknown" ? await checkSubscription(userId) : false;

        if (!hasSub) {
          const tg = (window as any).Telegram?.WebApp;
          tg?.showAlert(
            ru
              ? "Лимит 5 задач в день 📋\n\nОформи подписку (100 Stars/мес).\n\nНапиши боту /subscribe"
              : "Daily limit of 5 tasks 📋\n\nGet subscription.\n\nSend /subscribe"
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

      const validItems = shoppingItems.filter((i) => i.trim());

      await addTask({
        title: taskType === "shopping"
          ? `🛒 ${ru ? "Список покупок" : "Shopping list"}`
          : title.trim(),
        description: taskType === "shopping" ? validItems.join("\n") : "",
        dueDate,
        priority,
        status: "todo",
        isAiCreated: false,
        repeat: repeat ? "daily" : "none",
        type: taskType,
        items: taskType === "shopping" ? validItems : [],
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
          position: "fixed", bottom: "90px", right: "16px", zIndex: 40,
          width: "56px", height: "56px", borderRadius: "50%",
          backgroundColor: "#3b82f6", color: "white", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(59,130,246,0.5)",
          WebkitTapHighlightColor: "transparent",
        }}
        onClick={() => { triggerHaptic("light"); setOpen(true); }}
      >
        <Plus size={24} />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center",
        justifyContent: "center", padding: "16px",
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "320px",
          backgroundColor: "#1e293b",
          borderRadius: "20px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        {/* Контент с padding */}
        <div style={{ padding: "20px" }}>

          {/* Индикатор шагов */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              {[0, 1, 2].map((s) => (
                <div key={s} style={{
                  height: "3px", width: "20px", borderRadius: "2px",
                  backgroundColor: step >= s ? "#3b82f6" : "rgba(255,255,255,0.15)",
                  transition: "background-color 0.3s ease",
                }} />
              ))}
            </div>
            {step > 0 && (
              <button
                onClick={handleBack}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "rgba(255,255,255,0.4)", fontSize: "13px",
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: 0,
                }}
              >
                <ArrowLeft size={14} />
                {ru ? "Назад" : "Back"}
              </button>
            )}
          </div>

          {/* ШАГ 0 — Выбор типа */}
          {step === 0 && (
            <div>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "white", marginBottom: "16px", margin: "0 0 16px 0" }}>
                {ru ? "Что создаём?" : "What to create?"}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button
                  onClick={() => handleSelectType("task")}
                  style={{
                    height: "90px", borderRadius: "16px",
                    border: "1px solid rgba(59,130,246,0.3)",
                    backgroundColor: "rgba(59,130,246,0.1)",
                    cursor: "pointer", display: "flex",
                    flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: "8px",
                  }}
                >
                  <CheckSquare size={28} color="#3b82f6" />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#93c5fd" }}>
                    {ru ? "Задача" : "Task"}
                  </span>
                </button>

                <button
                  onClick={() => handleSelectType("shopping")}
                  style={{
                    height: "90px", borderRadius: "16px",
                    border: "1px solid rgba(34,197,94,0.3)",
                    backgroundColor: "rgba(34,197,94,0.1)",
                    cursor: "pointer", display: "flex",
                    flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: "8px",
                  }}
                >
                  <ShoppingCart size={28} color="#22c55e" />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#86efac" }}>
                    {ru ? "Покупки" : "Shopping"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ШАГ 1 — Название или список покупок */}
          {step === 1 && (
            <div>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "white", margin: "0 0 14px 0" }}>
                {taskType === "shopping"
                  ? (ru ? "🛒 Что купить?" : "🛒 What to buy?")
                  : (ru ? "Что нужно сделать?" : "What to do?")}
              </p>

              {taskType === "task" ? (
                <>
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNext()}
                    placeholder={ru ? "Название задачи..." : "Task title..."}
                    style={inputStyle}
                  />

                  <p style={labelStyle}>{ru ? "Приоритет" : "Priority"}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                    {priorityOptions.map(({ value, emoji }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPriority(value)}
                        style={{
                          height: "38px", borderRadius: "10px",
                          border: priority === value
                            ? "1px solid #3b82f6"
                            : "1px solid rgba(255,255,255,0.08)",
                          fontSize: "12px", fontWeight: 500, cursor: "pointer",
                          backgroundColor: priority === value
                            ? "rgba(59,130,246,0.2)"
                            : "rgba(255,255,255,0.05)",
                          color: priority === value
                            ? "#60a5fa"
                            : "rgba(255,255,255,0.5)",
                        }}
                      >
                        {emoji} {t(language, value)}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div
                    style={{
                      maxHeight: "200px", overflowY: "auto",
                      marginBottom: "10px",
                    }}
                  >
                    {shoppingItems.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                        <input
                          autoFocus={idx === 0}
                          value={item}
                          onChange={(e) => {
                            const updated = [...shoppingItems];
                            updated[idx] = e.target.value;
                            setShoppingItems(updated);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setShoppingItems([...shoppingItems, ""]);
                            }
                          }}
                          placeholder={ru ? `Товар ${idx + 1}...` : `Item ${idx + 1}...`}
                          style={{
                            ...inputStyle,
                            marginBottom: 0,
                            flex: 1,
                            boxSizing: "border-box" as const,
                          }}
                        />
                        {shoppingItems.length > 1 && (
                          <button
                            onClick={() => setShoppingItems(shoppingItems.filter((_, i) => i !== idx))}
                            style={{
                              width: "44px", height: "44px",
                              borderRadius: "10px", border: "none",
                              backgroundColor: "rgba(239,68,68,0.1)",
                              color: "#ef4444", cursor: "pointer",
                              fontSize: "18px", flexShrink: 0,
                              display: "flex", alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setShoppingItems([...shoppingItems, ""])}
                    style={{
                      width: "100%", height: "38px", borderRadius: "10px",
                      border: "1px dashed rgba(255,255,255,0.15)",
                      backgroundColor: "transparent",
                      color: "rgba(255,255,255,0.4)",
                      cursor: "pointer", fontSize: "13px",
                      marginBottom: "14px",
                      boxSizing: "border-box" as const,
                    }}
                  >
                    + {ru ? "Добавить товар" : "Add item"}
                  </button>
                </>
              )}

              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" onClick={handleClose} style={cancelBtnStyle}>
                  {ru ? "Отмена" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={
                    taskType === "task"
                      ? !title.trim()
                      : !shoppingItems.some((i) => i.trim())
                  }
                  style={{
                    flex: 1, height: "44px", borderRadius: "12px",
                    border: "none", fontSize: "14px", fontWeight: 600,
                    color: "white", cursor: "pointer",
                    backgroundColor:
                      (taskType === "task" ? title.trim() : shoppingItems.some((i) => i.trim()))
                        ? "#3b82f6"
                        : "rgba(255,255,255,0.1)",
                    transition: "background-color 0.2s ease",
                  }}
                >
                  {ru ? "Далее →" : "Next →"}
                </button>
              </div>
            </div>
          )}

          {/* ШАГ 2 — Дата, время, повтор */}
          {step === 2 && (
            <div>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "white", margin: "0 0 14px 0" }}>
                {ru ? "Когда напомнить?" : "When to remind?"}
              </p>

              <p style={labelStyle}>{ru ? "Дата" : "Date"}</p>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  ...inputStyle,
                  colorScheme: "dark",
                  WebkitAppearance: "none" as any,
                  appearance: "none" as any,
                }}
              />

              <p style={labelStyle}>{ru ? "Время" : "Time"}</p>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                style={{
                  ...inputStyle,
                  colorScheme: "dark",
                  WebkitAppearance: "none" as any,
                  appearance: "none" as any,
                }}
              />

              {/* Повтор */}
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: "rgba(255,255,255,0.05)",
                borderRadius: "12px", padding: "11px 14px",
                marginBottom: "16px",
                border: "1px solid rgba(255,255,255,0.08)",
                boxSizing: "border-box" as const,
              }}>
                <p style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255,255,255,0.8)", margin: 0 }}>
                  🔁 {ru ? "Каждый день" : "Daily"}
                </p>
                <div
                  onClick={() => setRepeat(!repeat)}
                  style={{
                    position: "relative", width: "44px", minWidth: "44px",
                    height: "24px", borderRadius: "12px",
                    backgroundColor: repeat ? "#3b82f6" : "rgba(255,255,255,0.15)",
                    cursor: "pointer", transition: "background-color 0.2s ease",
                    flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: "absolute", top: "2px",
                    left: repeat ? "22px" : "2px",
                    width: "20px", height: "20px",
                    borderRadius: "50%", backgroundColor: "white",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    transition: "left 0.2s ease",
                  }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" onClick={handleClose} style={cancelBtnStyle}>
                  {ru ? "Отмена" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  style={{
                    flex: 1, height: "44px", borderRadius: "12px",
                    border: "none",
                    backgroundColor: saving ? "rgba(59,130,246,0.5)" : "#3b82f6",
                    fontSize: "14px", fontWeight: 600,
                    color: "white", cursor: saving ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {saving ? (ru ? "Сохраняю..." : "Saving...") : (ru ? "Создать ✅" : "Create ✅")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box" as const,
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
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "rgba(255,255,255,0.4)",
  marginBottom: "6px",
  display: "block",
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1,
  height: "44px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.1)",
  backgroundColor: "transparent",
  fontSize: "14px",
  fontWeight: 500,
  color: "rgba(255,255,255,0.5)",
  cursor: "pointer",
};
