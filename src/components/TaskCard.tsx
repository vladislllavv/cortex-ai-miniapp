import { useState } from "react";
import { CheckCircle2, Circle, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { triggerHaptic } from "@/lib/telegram";
import { t, useI18nStore } from "@/lib/i18n";
import { TaskPriority, type Task, useTaskStore } from "@/lib/store";
import { formatTaskDay } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = { task: Task };

export default function TaskCard({ task }: Props) {
  const language = useI18nStore((state) => state.language);
  const toggleTaskStatus = useTaskStore((state) => state.toggleTaskStatus);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const updateTask = useTaskStore((state) => state.updateTask);
  const [openEdit, setOpenEdit] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [date, setDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [time, setTime] = useState(task.dueDate ? task.dueDate.slice(11, 16) : "");

  const handleToggleStatus = () => {
    triggerHaptic(task.status === "done" ? "light" : "success");
    toggleTaskStatus(task.id);
  };

  const handleDelete = () => {
    triggerHaptic("warning");
    deleteTask(task.id);
  };

  const handleEdit = () => {
    triggerHaptic("light");
    setOpenEdit(true);
  };

  const onSaveEdit = () => {
    if (!title.trim()) return;
    const dueDate = date ? new Date(`${date}T${time || "09:00"}:00`).toISOString() : undefined;
    triggerHaptic("success");
    updateTask(task.id, {
      title: title.trim(),
      priority,
      dueDate,
    });
    setOpenEdit(false);
  };

  const priorityColor = {
    low: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-rose-100 text-rose-700",
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {openEdit ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-4" onClick={() => setOpenEdit(false)}>
          <Card className="mx-auto mt-20 max-w-md space-y-3 text-slate-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">{t(language, "editTask")}</h3>
            <div>
              <label className="block text-xs text-slate-500 mb-1">{t(language, "taskTitle")}</label>
              <input
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E86C1]/40"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500">{t(language, "reminderDate")}</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E86C1]/40"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">{t(language, "reminderTime")}</label>
                <input
                  type="time"
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-[#2E86C1]/40"
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
              <Button variant="outline" className="flex-1" onClick={() => setOpenEdit(false)}>
                {t(language, "cancel")}
              </Button>
              <Button className="flex-1" onClick={onSaveEdit}>
                {t(language, "saveChanges")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
      <Card className="space-y-3 text-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-semibold ${task.status === "done" ? "line-through text-slate-400" : "text-slate-900"}`}>
              {task.title}
            </h3>
            {task.description ? (
              <p className="mt-1 text-xs text-slate-500">{task.description}</p>
            ) : null}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityColor[task.priority]}`}>
            {task.priority}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {formatTaskDay(task.dueDate ? new Date(task.dueDate) : null, language)}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={handleEdit} className="h-8 w-8 p-0">
              <Pencil className="h-4 w-4 text-slate-400" />
            </Button>
            <Button variant="ghost" onClick={handleToggleStatus} className="h-8 w-8 p-0">
              {task.status === "done" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4 text-slate-400" />
              )}
            </Button>
            <Button variant="ghost" onClick={handleDelete} className="h-8 w-8 p-0">
              <Trash2 className="h-4 w-4 text-rose-500" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
