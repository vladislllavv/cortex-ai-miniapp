import { create } from "zustand";
import { useEffect } from "react";
import { db } from "./firebase";
import { collection, addDoc, Timestamp, doc, getDoc } from "firebase/firestore";

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskRepeat = "none" | "daily";

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
  repeat: TaskRepeat;
};

type TaskStore = {
  tasks: Task[];
  selectedDate: string | null;
  addTask: (task: Omit<Task, "id" | "createdAt" | "notified">) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  toggleTaskStatus: (taskId: string) => void;
  setSelectedDate: (date: string | null) => void;
};

const STORAGE_KEY = "cortex-tasks";
const CHAT_STORAGE_KEY = "cortex-ai-chat";

// Хранение истории чата
export function saveChatHistory(messages: { role: string; content: string }[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {}
}

export function loadChatHistory(): { role: string; content: string }[] {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function getTelegramUserId(): string {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return "unknown";
    if (tg.initDataUnsafe?.user?.id) {
      return String(tg.initDataUnsafe.user.id);
    }
  } catch {}
  return "unknown";
}

export async function checkSubscription(userId: string): Promise<boolean> {
  try {
    if (userId === "unknown") return false;
    const subDoc = await getDoc(doc(db, "subscriptions", userId));
    if (!subDoc.exists()) return false;
    const data = subDoc.data();
    if (!data.isActive || !data.expiresAt) return false;
    return data.expiresAt.toDate() > new Date();
  } catch {
    return false;
  }
}

function normalizeTask(task: any): Task {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || "",
    description: task.description || "",
    dueDate: task.dueDate,
    priority: task.priority || "medium",
    status: task.status || "todo",
    isAiCreated: Boolean(task.isAiCreated),
    createdAt: task.createdAt || new Date().toISOString(),
    notified: Boolean(task.notified),
    repeat: task.repeat === "daily" ? "daily" : "none",
  };
}

function loadTasks(): Task[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.map(normalizeTask);
    }
  } catch {}
  return [];
}

function saveTasks(tasks: Task[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {}
}

async function saveTaskToFirebase(task: Task) {
  try {
    const userId = getTelegramUserId();
    let reminderAt = null;
    if (task.dueDate) {
      const date = new Date(task.dueDate);
      if (!isNaN(date.getTime())) {
        reminderAt = Timestamp.fromDate(date);
      }
    }
    await addDoc(collection(db, "tasks"), {
      userId,
      taskId: task.id,
      title: task.title,
      description: task.description || "",
      dueDate: task.dueDate || null,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt,
      isSent: false,
      reminderAt,
      repeat: task.repeat || "none",
    });
  } catch (e: any) {
    console.error("Firebase save error:", e.message);
  }
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: loadTasks(),
  selectedDate: null,

  addTask: async (task) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      notified: false,
      repeat: task.repeat || "none",
    };

    // Добавляем мгновенно в UI
    set((state) => {
      const updated = [newTask, ...state.tasks];
      saveTasks(updated);
      return { tasks: updated };
    });

    // Сохраняем в Firebase асинхронно
    saveTaskToFirebase(newTask).catch(console.error);
  },

  updateTask: (taskId, updates) =>
    set((state) => {
      const updated = state.tasks.map((t) =>
        t.id === taskId ? normalizeTask({ ...t, ...updates }) : t
      );
      saveTasks(updated);
      return { tasks: updated };
    }),

  deleteTask: (taskId) =>
    set((state) => {
      const updated = state.tasks.filter((t) => t.id !== taskId);
      saveTasks(updated);
      return { tasks: updated };
    }),

  toggleTaskStatus: (taskId) =>
    set((state) => {
      const updated = state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: (t.status === "done" ? "todo" : "done") as TaskStatus }
          : t
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
      if (current.length === 0) {
        useTaskStore.setState({ tasks: stored });
      }
    }
  }, []);
}
