import { useState, useRef } from "react";
import { Plus, ShoppingCart, CheckSquare, ArrowLeft, Clock } from "lucide-react";
import { triggerHaptic } from "@/lib/telegram";
import { t, useI18nStore } from "@/lib/i18n";
import {
  TaskPriority,
  useTaskStore,
  checkSubscription,
  getSafeUserId,
} from "@/lib/store";

const priorityOptions = [
  { value: "low" as TaskPriority, emoji: "🟢" },
  { value: "medium" as TaskPriority, emoji: "🟡" },
  { value: "high" as TaskPriority, emoji: "🔴" },
];

const REMIND_BEFORE_OPTIONS = [
  { value: 0,    label: "Вовремя",  labelEn: "On time"        },
  { value: 10,   label: "За 10 мин", labelEn: "10 min before" },
  { value: 30,   label: "За 30 мин", labelEn: "30 min before" },
  { value: 60,   label: "За 1 час",  labelEn: "1 hour before" },
  { value: 1440, label: "За 1 день", labelEn: "1 day before"  },
];

const REPEAT_OPTIONS = [
  { value: "none",     label: "Без повтора",   labelEn: "No repeat"   },
  { value: "daily",    label: "Каждый день",   labelEn: "Every day"   },
  { value: "weekdays", label: "Пн–Пт",         labelEn: "Mon–Fri"     },
  { value: "weekends", label: "Сб–Вс",         labelEn: "Sat–Sun"     },
  { value: "custom",   label: "Выбрать дни",   labelEn: "Custom days" },
];

const WEEKDAYS = [
  { key: "mon", ru: "Пн", en: "Mo" },
  { key: "tue", ru: "Вт", en: "Tu" },
  { key: "wed", ru: "Ср", en: "We" },
  { key: "thu", ru: "Чт", en: "Th" },
  { key: "fri", ru: "Пт", en: "Fr" },
  { key: "sat", ru: "Сб", en: "Sa" },
  { key: "sun", ru: "Вс", en: "Su" },
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
  const [repeat, setRepeat] = useState("none");
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [remindBefore, setRemindBefore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [shoppingItems, setShoppingItems] = useState<string[]>([""]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const savingRef = useRef(false);

  const resetForm = () => {
    setTitle(""); setDate(""); setTime("");
    setPriority("medium"); setRepeat("none");
    setCustomDays([]); setRemindBefore(0);
    setStep(0); setTaskType("task");
    setSaving(false); setShoppingItems([""]);
    setTags([]); setTagInput("");
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

  const toggleCustomDay = (day: string) => {
    setCustomDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const onSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const todayTasks = tasks.filter((t) => t.createdAt.startsWith(todayStr));

      if (todayTasks.length >= 5) {
        const userId = getSafeUserId();
        const hasSub =
          userId ? await checkSubscription(userId) : false;
        if (!hasSub) {
          const tg = (window as any).Telegram?.WebApp;
          tg?.showAlert(
            ru
              ? "Лимит 5 задач в день 📋\n\nОформи подписку."
              : "Daily limit 5 tasks.\n\nGet subscription."
          );
          tg?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
          handleClose();
          return;
        }
      }

      // ✅ ИСПРАВЛЕНИЕ: dueDate = реальный дедлайн БЕЗ смещения
      // reminderOffsetMinutes хранится отдельно
      let dueDate: string | undefined;
      if (date && time) {
        const p = new Date(`${date}T${time}:00`);
        if (!isNaN(p.getTime())) {
          dueDate = p.toISOString(); // ✅ Реальное время дедлайна
        }
      } else if (date) {
        const p = new Date(`${date}T09:00:00`);
        if (!isNaN(p.getTime())) {
          dueDate = p.toISOString(); // ✅ Реальное время дедлайна
        }
      }

      const validItems = shoppingItems.filter((i) => i.trim());

      // ✅ Формируем repeat строку с поддержкой всех вариантов
      let repeatValue: string = repeat;
      if (repeat === "custom") {
        if (customDays.length > 0) {
          repeatValue = `custom:${customDays.join(",")}`;
        } else {
          repeatValue = "none";
        }
      }

      // ✅ addTask — единственная точка записи в Firebase
      // Никаких addDoc(collection(db, "tasks")) здесь — всё в store.ts
      await addTask({
        title:
          taskType === "shopping"
            ? `🛒 ${ru ? "Список покупок" : "Shopping list"}`
            : title.trim(),
        description:
          taskType === "shopping" ? validItems.join("\n") : "",
        dueDate,
        // ✅ Сохраняем offset отдельно — store вычислит reminderAt сам
        reminderOffsetMinutes: remindBefore,
        priority,
        status: "todo",
        isAiCreated: false,
        repeat: repeatValue as any,
        type: taskType,
        items: taskType === "shopping" ? validItems : [],
        tags,
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
          maxWidth: "340px",
          backgroundColor: "#1e293b",
          borderRadius: "20px",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ padding: "20px" }}>

          {/* Индикатор шагов */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", gap: "4px" }}>
              {[0, 1, 2].map((s) => (
                <div
                  key={s}
                  style={{
                    height: "3px",
                    width: "20px",
                    borderRadius: "2px",
                    backgroundColor:
                      step >= s ? "#3b82f6" : "rgba(255,255,255,0.15)",
                    transition: "background-color 0.3s",
                  }}
                />
              ))}
            </div>
            {step > 0 && (
              <button
                onClick={handleBack}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: 0,
                }}
              >
                <ArrowLeft size={14} /> {ru ? "Назад" : "Back"}
              </button>
            )}
          </div>

          {/* ШАГ 0 — Тип */}
          {step === 0 && (
            <div>
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "white",
                  margin: "0 0 16px 0",
                }}
              >
                {ru ? "Что создаём?" : "What to create?"}
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <button
                  onClick={() => handleSelectType("task")}
                  style={{
                    height: "90px",
                    borderRadius: "16px",
                    border: "1px solid rgba(59,130,246,0.3)",
                    backgroundColor: "rgba(59,130,246,0.1)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <CheckSquare size={28} color="#3b82f6" />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#93c5fd",
                    }}
                  >
                    {ru ? "Задача" : "Task"}
                  </span>
                </button>
                <button
                  onClick={() => handleSelectType("shopping")}
                  style={{
                    height: "90px",
                    borderRadius: "16px",
                    border: "1px solid rgba(34,197,94,0.3)",
                    backgroundColor: "rgba(34,197,94,0.1)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <ShoppingCart size={28} color="#22c55e" />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#86efac",
                    }}
                  >
                    {ru ? "Покупки" : "Shopping"}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ШАГ 1 — Название / Список покупок */}
          {step === 1 && (
            <div>
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "white",
                  margin: "0 0 14px 0",
                }}
              >
                {taskType === "shopping"
                  ? ru ? "🛒 Что купить?" : "🛒 What to buy?"
                  : ru ? "Что нужно сделать?" : "What to do?"}
              </p>

              {taskType === "task" ? (
                <>
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleNext()}
                    placeholder={ru ? "Название задачи..." : "Task title..."}
                    style={{
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
                    }}
                  />

                  <p
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "8px",
                    }}
                  >
                    {ru ? "Приоритет" : "Priority"}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "8px",
                      marginBottom: "12px",
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
                          border:
                            priority === value
                              ? "1px solid #3b82f6"
                              : "1px solid rgba(255,255,255,0.08)",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                          backgroundColor:
                            priority === value
                              ? "rgba(59,130,246,0.2)"
                              : "rgba(255,255,255,0.05)",
                          color:
                            priority === value
                              ? "#60a5fa"
                              : "rgba(255,255,255,0.5)",
                          transition: "all 0.15s",
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
                      maxHeight: "200px",
                      overflowY: "auto",
                      marginBottom: "10px",
                    }}
                  >
                    {shoppingItems.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          gap: "6px",
                          marginBottom: "8px",
                        }}
                      >
                        <input
                          autoFocus={idx === 0}
                          value={item}
                          onChange={(e) => {
                            const u = [...shoppingItems];
                            u[idx] = e.target.value;
                            setShoppingItems(u);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setShoppingItems([...shoppingItems, ""]);
                            }
                          }}
                          placeholder={
                            ru ? `Товар ${idx + 1}...` : `Item ${idx + 1}...`
                          }
                          style={{
                            flex: 1,
                            height: "42px",
                            borderRadius: "10px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            backgroundColor: "rgba(255,255,255,0.07)",
                            paddingLeft: "12px",
                            paddingRight: "12px",
                            fontSize: "14px",
                            color: "white",
                            outline: "none",
                            fontFamily: "inherit",
                            boxSizing: "border-box" as const,
                          }}
                        />
                        {shoppingItems.length > 1 && (
                          <button
                            onClick={() =>
                              setShoppingItems(
                                shoppingItems.filter((_, i) => i !== idx)
                              )
                            }
                            style={{
                              width: "42px",
                              height: "42px",
                              borderRadius: "10px",
                              border: "none",
                              backgroundColor: "rgba(239,68,68,0.1)",
                              color: "#ef4444",
                              cursor: "pointer",
                              fontSize: "18px",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
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
                      width: "100%",
                      height: "36px",
                      borderRadius: "10px",
                      border: "1px dashed rgba(255,255,255,0.15)",
                      backgroundColor: "transparent",
                      color: "rgba(255,255,255,0.4)",
                      cursor: "pointer",
                      fontSize: "13px",
                      marginBottom: "12px",
                      boxSizing: "border-box" as const,
                    }}
                  >
                    + {ru ? "Добавить товар" : "Add item"}
                  </button>
                </>
              )}

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
                  disabled={
                    taskType === "task"
                      ? !title.trim()
                      : !shoppingItems.some((i) => i.trim())
                  }
                  style={{
                    flex: 1,
                    height: "44px",
                    borderRadius: "12px",
                    border: "none",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "white",
                    cursor: "pointer",
                    backgroundColor:
                      (taskType === "task"
                        ? title.trim()
                        : shoppingItems.some((i) => i.trim()))
                        ? "#3b82f6"
                        : "rgba(255,255,255,0.1)",
                    transition: "background-color 0.2s",
                  }}
                >
                  {ru ? "Далее →" : "Next →"}
                </button>
              </div>
            </div>
          )}

          {/* ШАГ 2 — Дата, повтор, напоминание */}
          {step === 2 && (
            <div>
              <p
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "white",
                  margin: "0 0 14px 0",
                }}
              >
                {ru ? "Когда и как?" : "When and how?"}
              </p>

              {/* Дата */}
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "6px",
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
                  colorScheme: "dark",
                  appearance: "none" as any,
                }}
              />

              {/* Время */}
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "6px",
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
                  colorScheme: "dark",
                  appearance: "none" as any,
                }}
              />

              {/* Напомнить заранее */}
              {(date || time) && (
                <>
                  <p
                    style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.4)",
                      marginBottom: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Clock size={11} />
                    {ru ? "Напомнить заранее" : "Remind before"}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      marginBottom: "12px",
                    }}
                  >
                    {REMIND_BEFORE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRemindBefore(opt.value)}
                        style={{
                          padding: "5px 10px",
                          borderRadius: "10px",
                          border:
                            remindBefore === opt.value
                              ? "1px solid #3b82f6"
                              : "1px solid rgba(255,255,255,0.08)",
                          backgroundColor:
                            remindBefore === opt.value
                              ? "rgba(59,130,246,0.2)"
                              : "rgba(255,255,255,0.05)",
                          color:
                            remindBefore === opt.value
                              ? "#60a5fa"
                              : "rgba(255,255,255,0.5)",
                          fontSize: "11px",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {ru ? opt.label : opt.labelEn}
                      </button>
                    ))}
                  </div>

                  {/* ✅ Показываем когда придёт напоминание */}
                  {remindBefore > 0 && date && time && (
                    <div
                      style={{
                        backgroundColor: "rgba(59,130,246,0.08)",
                        border: "1px solid rgba(59,130,246,0.2)",
                        borderRadius: "8px",
                        padding: "6px 10px",
                        marginBottom: "12px",
                      }}
                    >
                      <p
                        style={{
                          fontSize: "11px",
                          color: "#93c5fd",
                          margin: 0,
                        }}
                      >
                        🔔{" "}
                        {ru ? "Напомним в" : "Reminder at"}:{" "}
                        {(() => {
                          const due = new Date(`${date}T${time}:00`);
                          const reminderTime = new Date(
                            due.getTime() - remindBefore * 60 * 1000
                          );
                          return reminderTime.toLocaleTimeString(
                            ru ? "ru-RU" : "en-US",
                            { hour: "2-digit", minute: "2-digit" }
                          );
                        })()}
                        {" · "}
                        {ru ? "Дедлайн в" : "Deadline at"} {time}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Повтор */}
              <p
                style={{
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "6px",
                }}
              >
                {ru ? "Повтор" : "Repeat"}
              </p>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  marginBottom: repeat === "custom" ? "8px" : "16px",
                }}
              >
                {REPEAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRepeat(opt.value)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "10px",
                      border:
                        repeat === opt.value
                          ? "1px solid #3b82f6"
                          : "1px solid rgba(255,255,255,0.08)",
                      backgroundColor:
                        repeat === opt.value
                          ? "rgba(59,130,246,0.15)"
                          : "rgba(255,255,255,0.04)",
                      cursor: "pointer",
                      width: "100%",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color:
                          repeat === opt.value
                            ? "#60a5fa"
                            : "rgba(255,255,255,0.7)",
                      }}
                    >
                      {ru ? opt.label : opt.labelEn}
                    </span>
                    {repeat === opt.value && (
                      <div
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          backgroundColor: "#3b82f6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Выбор дней для custom */}
              {repeat === "custom" && (
                <div style={{ marginBottom: "16px" }}>
                  <p
                    style={{
                      fontSize: "11px",
                      color: "rgba(255,255,255,0.4)",
                      margin: "0 0 8px 0",
                    }}
                  >
                    {ru ? "Выбери дни недели:" : "Select days:"}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      justifyContent: "space-between",
                    }}
                  >
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.key}
                        type="button"
                        onClick={() => toggleCustomDay(day.key)}
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "50%",
                          border: customDays.includes(day.key)
                            ? "1px solid #3b82f6"
                            : "1px solid rgba(255,255,255,0.08)",
                          backgroundColor: customDays.includes(day.key)
                            ? "rgba(59,130,246,0.3)"
                            : "rgba(255,255,255,0.04)",
                          color: customDays.includes(day.key)
                            ? "#60a5fa"
                            : "rgba(255,255,255,0.5)",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {ru ? day.ru : day.en}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                  onClick={onSave}
                  disabled={saving}
                  style={{
                    flex: 1,
                    height: "44px",
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: saving
                      ? "rgba(59,130,246,0.5)"
                      : "#3b82f6",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "white",
                    cursor: saving ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {saving
                    ? ru ? "Сохраняю..." : "Saving..."
                    : ru ? "Создать ✅" : "Create ✅"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
