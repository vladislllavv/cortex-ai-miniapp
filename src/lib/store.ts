import { create } from "zustand";
import { useEffect } from "react";

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
  isAiCreated: boolean;
  createdAt: string;
  notified: boolean;
};

type TaskStore = {
  tasks: Task[];
  selectedDate: string | null;
  addTask: (task: Omit<Task, "id" | "createdAt" | "notified">) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  toggleTaskStatus: (taskId: string) => void;
  setSelectedDate: (date: string | null) => void;
};

const STORAGE_KEY = "cortex-tasks";

function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // corrupted data — reset
  }
  return [];
}

function saveTasks(tasks: Task[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.error("Failed to save tasks:", e);
  }
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: loadTasks(),
  selectedDate: null,

  addTask: (task) => {
    // Если даты нет — ставим сегодня, чтобы задача всегда была видна
    const dueDate = task.dueDate || new Date().toISOString();

    const newTask: Task = {
      ...task,
      dueDate,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      notified: false,
    };

    set((state) => {
      const updated = [newTask, ...state.tasks];
      saveTasks(updated);
      return { tasks: updated };
    });
  },

  updateTask: (taskId, updates) =>
    set((state) => {
      const updated = state.tasks.map((task) =>
        task.id === taskId ? { ...task, ...updates } : task
      );
      saveTasks(updated);
      return { tasks: updated };
    }),

  deleteTask: (taskId) =>
    set((state) => {
      const updated = state.tasks.filter((task) => task.id !== taskId);
      saveTasks(updated);
      return { tasks: updated };
    }),

  toggleTaskStatus: (taskId) =>
    set((state) => {
      const updated = state.tasks.map((task) =>
        task.id === taskId
          ? { ...task, status: (task.status === "done" ? "todo" : "done") as TaskStatus }
          : task
      );
      saveTasks(updated);
      return { tasks: updated };
    }),

  setSelectedDate: (date) => set({ selectedDate: date }),
}));

export function usePersistTasks() {
  useEffect(() => {
    // Перечитываем из localStorage при монтировании, на случай если
    // данные обновились в другой вкладке / при перезапуске
    const stored = loadTasks();
    if (stored.length > 0) {
      const current = useTaskStore.getState().tasks;
      // Если в памяти пусто а в хранилище есть — загружаем
      if (current.length === 0 && stored.length > 0) {
        useTaskStore.setState({ tasks: stored });
      }
    }
  }, []);
}
