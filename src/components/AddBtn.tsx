import { useState } from "react";
import { Plus, ArrowRight, ArrowLeft } from "lucide-react";
import { triggerHaptic } from "@/lib/telegram";
import { t, useI18nStore } from "@/lib/i18n";
import { TaskPriority, useTaskStore, checkSubscription } from "@/lib/store";

export default function AddBtn() {
  const language = useI18nStore((state) => state.language);
  const addTask = useTaskStore((state) => state.addTask);
  const tasks = useTaskStore((state) => state.tasks);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [repeat, setRepeat] = useState(false);

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
    resetForm();
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
      const hasSubscription = userId
        ? await checkSubscription(String(userId))
        : false;

      if (!hasSubscription) {
        const tg = (window as any).Telegram?.WebApp;
        tg?.showAlert(
          "У тебя уже 5 задач 📋\n\nДля добавления большего количества нужна подписка.\n\n💫 100 Stars в месяц\n\nНапиши боту /subscribe для оплаты."
        );
        tg?.openTelegramLink("https://t.me/aiplannerrubot");
        handleClose();
        return;
      }
    }

    let dueDate: string | undefined;

    if (date && time) {
      const parsed = new Date(`${date}T${time}:00`);
      if (!isNaN(parsed.getTime())) {
        dueDate = parsed.toISOString();
      }
    } else if (date) {
      const parsed = new Date(`${date}T09:00:00`);
      if (!isNaN(parsed.getTime())) {
        dueDate = parsed.toISOString();
      }
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

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/55"
          onClick={handleClose}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-[92vw] max-w-[300px] rounded-2xl bg-white p-4 shadow-2xl"
            >

              {/* Индикатор шагов */}
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-400">
                  {language === "ru" ? `Шаг ${step} из 2` : `Step ${step} of 2`}
                </p>
                <div className="flex gap-1.5">
                  <div className={`h-1.5 w-8 rounded-full transition-colors ${step >= 1 ? "bg-blue-500" : "bg-slate-200"}`} />
                  <div className={`h-1.5 w-8 rounded-full transition-colors ${step >= 2 ? "bg-blue-500" : "bg-slate-200"}`} />
                </div>
              </div>

              {/* ШАГ 1 */}
              {step === 1 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    {language === "ru" ? "Что нужно сделать?" : "What to do?"}
                  </h3>

                  {/* Название */}
                  <div>
                    <input
                      autoFocus
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleNext()}
                      placeholder={language === "ru" ? "Название задачи..." : "Task title..."}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  {/* Приоритет */}
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium text-slate-500">
                      {language === "ru" ? "Приоритет" : "Priority"}
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { value: "low", emoji: "🟢", label: language === "ru" ? "Низкий" : "Low" },
                        { value: "medium", emoji: "🟡", label: language === "ru" ? "Средний" : "Medium" },
                        { value: "high", emoji: "🔴", label: language === "ru" ? "Высокий" : "High" },
                      ] as { value: TaskPriority; emoji: string; label: string }[]).map(({ value, emoji, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPriority(value)}
                          className={`rounded-xl py-2 text-[11px] font-medium transition-colors ${
                            priority === value
                              ? "bg-blue-500 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {emoji} {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Кнопки */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600"
                    >
                      {language === "ru" ? "Отмена" : "Cancel"}
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={!title.trim()}
                      className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-blue-500 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {language === "ru" ? "Далее" : "Next"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ШАГ 2 */}
              {step === 2 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    {language === "ru" ? "Когда напомнить?" : "When to remind?"}
                  </h3>

                  {/* Дата */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">
                      {language === "ru" ? "Дата" : "Date"}
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  {/* Время */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">
                      {language === "ru" ? "Время" : "Time"}
                    </label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  {/* Повтор */}
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        🔁 {language === "ru" ? "Каждый день" : "Daily"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {language === "ru" ? "Повторять ежедневно" : "Repeat every day"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRepeat(!repeat)}
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        repeat ? "bg-blue-500" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          repeat ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Кнопки */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={onSave}
                      className="flex-1 rounded-xl bg-blue-500 py-2.5 text-sm font-medium text-white"
                    >
                      {language === "ru" ? "Создать ✅" : "Create ✅"}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      ) : null}

      {/* Кнопка + */}
      <button
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-2xl transition-colors hover:bg-blue-600"
        aria-label="Add task"
        onClick={() => {
          triggerHaptic("light");
          setOpen(true);
        }}
      >
        <Plus className="h-6 w-6" />
      </button>
    </>
  );
}
