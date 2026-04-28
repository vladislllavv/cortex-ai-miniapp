import { useState } from "react";
import { Plus } from "lucide-react";
import { triggerHaptic } from "@/lib/telegram";
import { Button } from "@/components/ui/button";
import { t, useI18nStore } from "@/lib/i18n";
import { TaskPriority, useTaskStore } from "@/lib/store";
import { Card } from "@/components/ui/card";

export default function AddBtn() {
  const language = useI18nStore((state) => state.language);
  const addTask = useTaskStore((state) => state.addTask);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");

  const onSave = () => {
    console.log("Кнопка сохранения нажата ✅");

    const trimmed = title.trim();
    if (!trimmed) return;

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

    console.log("dueDate:", dueDate);

    addTask({
      title: trimmed,
      dueDate,
      priority,
      status: "todo",
      isAiCreated: false,
    });

    setTitle("");
    setDate("");
    setTime("");
    setPriority("medium");
    triggerHaptic("success");
    setOpen(false);
  };

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-4" onClick={() => setOpen(false)}>
          <Card className="mx-auto mt-20 max-w-md space-y-3 text-slate-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{t(language, "createTask")}</h3>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t(language, "taskTitle")}</label>
              <input
                className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E86C1]/40"
                placeholder={t(language, "taskTitlePlaceholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500">{t(language, "reminderDate")}</label>
                <input
                  type="date"
                  className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E86C1]/40"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">{t(language, "reminderTime")}</label>
                <input
                  type="time"
                  className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E86C1]/40"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs text-slate-500">{t(language, "urgency")}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["low", "medium", "high"] as TaskPriority[]).map((value) => (
                  <Button
                    key={value}
                    variant={priority === value ? "default" : "outline"}
                    className="h-9"
                    onClick={() => setPriority(value)}
                  >
                    {t(language, value)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                {t(language, "cancel")}
              </Button>
              <Button className="flex-1" onClick={onSave} disabled={!title.trim()}>
                {t(language, "saveTask")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
      <button
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full p-0 shadow-2xl bg-[#2E86C1] text-white flex items-center justify-center hover:bg-[#2471A3] transition-colors cursor-pointer"
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
