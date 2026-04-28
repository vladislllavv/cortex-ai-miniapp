import { useState } from "react";
import { Plus } from "lucide-react";
import { triggerHaptic } from "@/lib/telegram";
import { Button } from "@/components/ui/button";
import { t, useI18nStore } from "@/lib/i18n";
import { TaskPriority, useTaskStore, checkSubscription } from "@/lib/store";

export default function AddBtn() {
  const language = useI18nStore((state) => state.language);
  const addTask = useTaskStore((state) => state.addTask);
  const tasks = useTaskStore((state) => state.tasks);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [repeat, setRepeat] = useState(false);

  const handleClose = () => {
    setOpen(false);
    setTitle("");
    setDate("");
    setTime("");
    setPriority("medium");
    setRepeat(false);
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
          onClick={handleClose}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <h3 className="text-base font-bold text-slate-900">
              {t(language, "createTask")}
            </h3>

            {/* Название задачи */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">
                {t(language, "taskTitle")}
              </label>
              <input
                autoFocus
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder={t(language, "taskTitlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Дата */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">
                {t(language, "reminderDate")}
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Время */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">
                {t(language, "reminderTime")}
              </label>
              <input
                type="time"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>

            {/* Приоритет */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-500">
                {t(language, "urgency")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["low", "medium", "high"] as TaskPriority[]).map((value) => (
                  <button
                    key={value}
                    onClick={() => setPriority(value)}
                    className={`rounded-xl py-2 text-sm font-medium transition-colors ${
                      priority === value
                        ? "bg-blue-500 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t(language, value)}
                  </button>
                ))}
              </div>
            </div>

            {/* Ежедневный повтор */}
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  🔁 {language === "ru" ? "Ежедневный повтор" : "Daily repeat"}
                </p>
                <p className="text-xs text-slate-500">
                  {language === "ru"
                    ? "Задача будет повторяться каждый день"
                    : "Task will repeat every day"}
                </p>
              </div>
              <button
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
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleClose}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {t(language, "cancel")}
              </button>
              <button
                onClick={onSave}
                disabled={!title.trim()}
                className="flex-1 rounded-xl bg-blue-500 py-3 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40"
              >
                {t(language, "saveTask")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Кнопка + */}
      <button
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-2xl hover:bg-blue-600 transition-colors"
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
