import { create } from "zustand";
import { useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";

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

function getTelegramUserId(): string {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user?.id) {
      return String(tg.initDataUnsafe.user.id);
    }
  } catch {}
  return "unknown";
}

function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
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

async function saveTaskToFirebase(task: Task) {
  const userId = getTelegramUserId();
  alert("Начинаю сохранение. UserID: " + userId);
  
  try {
    await addDoc(collection(db, "tasks"), {
      userId: userId,
      taskId: task.id,
      title: task.title,
      description: task.description || "",
      dueDate: task.dueDate || null,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt,
      isSent: false,
      reminderAt: task.dueDate ? Timestamp.fromDate(new Date(task.dueDate)) : null
    });
    alert("Задача сохранена в Firebase ✅");
  } catch (e: any) {
    alert("Ошибка Firebase: " + e.message);
    console.error("Ошибка:", e);
  }
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: loadTasks(),
  selectedDate: null,

  addTask: (task) => {
    alert("addTask вызван!");
    
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

    saveTaskToFirebase(newTask);
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
    const stored = loadTasks();
    if (stored.length > 0) {
      const current = useTaskStore.getState().tasks;
      if (current.length === 0 && stored.length > 0) {
        useTaskStore.setState({ tasks: stored });
      }
    }
  }, []);
}
