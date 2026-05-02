import { create } from "zustand";
import { useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskRepeat = "none" | "daily";
export type TaskType = "task" | "shopping";

export type Task = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
  isAiCreated: boolean;
  createdAt: string;
  completedAt?: string;
  updatedAt?: string;
  notified: boolean;
  repeat: TaskRepeat;
  category?: string;
  type: TaskType;
  items?: string[];
};

export type Birthday = {
  id: string;
  name: string;
  date: string;
  color: string;
};

export type Vacation = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
};

export type CustomCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

export type CategoryEvent = {
  id: string;
  categoryId: string;
  title: string;
  date: string;
  endDate?: string;
  notes?: string;
  color?: string;
};

type TaskStore = {
  tasks: Task[];
  birthdays: Birthday[];
  vacations: Vacation[];
  categories: CustomCategory[];
  categoryEvents: CategoryEvent[];
  selectedDate: string | null;
  isDataLoaded: boolean;
  isSynced: boolean;

  addTask: (task: Omit<Task, "id" | "createdAt" | "notified">) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  toggleTaskStatus: (taskId: string) => void;
  setSelectedDate: (date: string | null) => void;

  addBirthday: (birthday: Omit<Birthday, "id">) => Promise<void>;
  deleteBirthday: (id: string) => Promise<void>;

  addVacation: (vacation: Omit<Vacation, "id">) => Promise<void>;
  deleteVacation: (id: string) => Promise<void>;

  addCategory: (category: Omit<CustomCategory, "id">) => void;
  updateCategory: (id: string, updates: Partial<CustomCategory>) => void;
  deleteCategory: (id: string) => void;

  addCategoryEvent: (event: Omit<CategoryEvent, "id">) => Promise<void>;
  deleteCategoryEvent: (id: string) => Promise<void>;

  loadUserData: (userId: string) => Promise<void>;
  startSync: (userId: string) => () => void;
  cleanupOldTasks: (userId: string) => Promise<void>;
};

const STORAGE_KEY = "cortex-tasks";
const CHAT_STORAGE_KEY = "cortex-ai-chat";
const CATEGORIES_KEY = "cortex-categories";
const CATEGORY_EVENTS_KEY = "cortex-category-events";

export function saveChatHistory(messages: { role: string; content: string }[]) {
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); } catch {}
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
    if (tg.initDataUnsafe?.user?.id) return String(tg.initDataUnsafe.user.id);
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
  } catch { return false; }
}

export async function getSubscriptionInfo(userId: string): Promise<{
  isActive: boolean; expiresAt: Date | null; daysLeft: number;
}> {
  try {
    if (userId === "unknown") return { isActive: false, expiresAt: null, daysLeft: 0 };
    const subDoc = await getDoc(doc(db, "subscriptions", userId));
    if (!subDoc.exists()) return { isActive: false, expiresAt: null, daysLeft: 0 };
    const data = subDoc.data();
    if (!data.isActive || !data.expiresAt) return { isActive: false, expiresAt: null, daysLeft: 0 };
    const expiresAt = data.expiresAt.toDate();
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { isActive: daysLeft > 0, expiresAt, daysLeft };
  } catch { return { isActive: false, expiresAt: null, daysLeft: 0 }; }
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
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
    notified: Boolean(task.notified),
    repeat: task.repeat === "daily" ? "daily" : "none",
    category: task.category || "",
    type: task.type === "shopping" ? "shopping" : "task",
    items: task.items || [],
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch {}
}

function loadCategories(): CustomCategory[] {
  try {
    const stored = localStorage.getItem(CATEGORIES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [
    { id: "birthdays", name: "Дни рождения", color: "#3b82f6", icon: "🎂" },
    { id: "vacations", name: "Отпуска", color: "#22c55e", icon: "🌴" },
  ];
}

function saveCategories(cats: CustomCategory[]) {
  try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats)); } catch {}
}

function loadCategoryEvents(): CategoryEvent[] {
  try {
    const stored = localStorage.getItem(CATEGORY_EVENTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveCategoryEventsLocal(events: CategoryEvent[]) {
  try { localStorage.setItem(CATEGORY_EVENTS_KEY, JSON.stringify(events)); } catch {}
}

// Единственная запись — только в users/{userId}/tasks
async function saveTaskToFirebase(task: Task, userId: string) {
  if (userId === "unknown") return;
  try {
    let reminderAt = null;
    if (task.dueDate) {
      const date = new Date(task.dueDate);
      if (!isNaN(date.getTime())) reminderAt = Timestamp.fromDate(date);
    }
    await setDoc(doc(db, "users", userId, "tasks", task.id), {
      ...task,
      userId,
      isSent: false,
      reminderAt,
      updatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("Firebase save error:", e.message);
  }
}

async function deleteTaskFromFirebase(taskId: string, userId: string) {
  if (userId === "unknown") return;
  try {
    await deleteDoc(doc(db, "users", userId, "tasks", taskId));
  } catch (e: any) {
    console.error("Firebase delete error:", e.message);
  }
}

async function cleanupDoneTasks(userId: string): Promise<Task[]> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (userId !== "unknown") {
    try {
      const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
      const batch = writeBatch(db);
      tasksSnap.forEach((d) => {
        const data = d.data();
        if (data.status === "done" && data.completedAt) {
          const completedAt = new Date(data.completedAt);
          if (completedAt < yesterday) {
            batch.delete(doc(db, "users", userId, "tasks", d.id));
          }
        }
      });
      await batch.commit();
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }

  const localTasks = loadTasks();
  const filtered = localTasks.filter((t) => {
    if (t.status === "done" && t.completedAt) {
      return new Date(t.completedAt) >= yesterday;
    }
    return true;
  });

  saveTasks(filtered);
  return filtered;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: loadTasks(),
  birthdays: [],
  vacations: [],
  categories: loadCategories(),
  categoryEvents: loadCategoryEvents(),
  selectedDate: null,
  isDataLoaded: false,
  isSynced: false,

  // Только одна запись в Firebase
  addTask: async (task) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notified: false,
      repeat: task.repeat || "none",
      category: task.category || "",
      type: task.type || "task",
      items: task.items || [],
    };

    set((state) => {
      const updated = [newTask, ...state.tasks];
      saveTasks(updated);
      return { tasks: updated };
    });

    const userId = getTelegramUserId();
    saveTaskToFirebase(newTask, userId).catch(console.error);
  },

  updateTask: (taskId, updates) => {
    set((state) => {
      const updated = state.tasks.map((t) =>
        t.id === taskId
          ? normalizeTask({ ...t, ...updates, updatedAt: new Date().toISOString() })
          : t
      );
      saveTasks(updated);
      const userId = getTelegramUserId();
      const updatedTask = updated.find((t) => t.id === taskId);
      if (updatedTask) saveTaskToFirebase(updatedTask, userId).catch(console.error);
      return { tasks: updated };
    });
  },

  deleteTask: (taskId) => {
    set((state) => {
      const updated = state.tasks.filter((t) => t.id !== taskId);
      saveTasks(updated);
      const userId = getTelegramUserId();
      deleteTaskFromFirebase(taskId, userId).catch(console.error);
      return { tasks: updated };
    });
  },

  toggleTaskStatus: (taskId) => {
    set((state) => {
      const now = new Date().toISOString();
      const updated = state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const newStatus = t.status === "done" ? "todo" : "done";
        return {
          ...t,
          status: newStatus as TaskStatus,
          completedAt: newStatus === "done" ? now : undefined,
          updatedAt: now,
        };
      });
      saveTasks(updated);
      const userId = getTelegramUserId();
      const updatedTask = updated.find((t) => t.id === taskId);
      if (updatedTask) saveTaskToFirebase(updatedTask, userId).catch(console.error);
      return { tasks: updated };
    });
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  addBirthday: async (birthday) => {
    const id = crypto.randomUUID();
    const newBirthday: Birthday = { ...birthday, id };
    set((state) => ({ birthdays: [...state.birthdays, newBirthday] }));
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      setDoc(doc(db, "users", userId, "birthdays", id), newBirthday).catch(console.error);
    }
  },

  deleteBirthday: async (id) => {
    set((state) => ({ birthdays: state.birthdays.filter((b) => b.id !== id) }));
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      deleteDoc(doc(db, "users", userId, "birthdays", id)).catch(console.error);
    }
  },

  addVacation: async (vacation) => {
    const id = crypto.randomUUID();
    const newVacation: Vacation = { ...vacation, id };
    set((state) => ({ vacations: [...state.vacations, newVacation] }));
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      setDoc(doc(db, "users", userId, "vacations", id), newVacation).catch(console.error);
    }
  },

  deleteVacation: async (id) => {
    set((state) => ({ vacations: state.vacations.filter((v) => v.id !== id) }));
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      deleteDoc(doc(db, "users", userId, "vacations", id)).catch(console.error);
    }
  },

  addCategory: (category) => {
    const id = crypto.randomUUID();
    set((state) => {
      const updated = [...state.categories, { ...category, id }];
      saveCategories(updated);
      return { categories: updated };
    });
  },

  updateCategory: (id, updates) =>
    set((state) => {
      const updated = state.categories.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      );
      saveCategories(updated);
      return { categories: updated };
    }),

  deleteCategory: (id) =>
    set((state) => {
      const updatedCats = state.categories.filter((c) => c.id !== id);
      const updatedEvents = state.categoryEvents.filter((e) => e.categoryId !== id);
      saveCategories(updatedCats);
      saveCategoryEventsLocal(updatedEvents);
      return { categories: updatedCats, categoryEvents: updatedEvents };
    }),

  addCategoryEvent: async (event) => {
    const id = crypto.randomUUID();
    const newEvent: CategoryEvent = { ...event, id };
    set((state) => {
      const updated = [...state.categoryEvents, newEvent];
      saveCategoryEventsLocal(updated);
      return { categoryEvents: updated };
    });
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      setDoc(doc(db, "users", userId, "categoryEvents", id), newEvent).catch(console.error);
    }
  },

  deleteCategoryEvent: async (id) => {
    set((state) => {
      const updated = state.categoryEvents.filter((e) => e.id !== id);
      saveCategoryEventsLocal(updated);
      return { categoryEvents: updated };
    });
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      deleteDoc(doc(db, "users", userId, "categoryEvents", id)).catch(console.error);
    }
  },

  loadUserData: async (userId) => {
    if (userId === "unknown") {
      set({ isDataLoaded: true });
      return;
    }
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const [birthdaysSnap, vacationsSnap, categoryEventsSnap, tasksSnap] = await Promise.all([
        getDocs(collection(db, "users", userId, "birthdays")),
        getDocs(collection(db, "users", userId, "vacations")),
        getDocs(collection(db, "users", userId, "categoryEvents")),
        getDocs(collection(db, "users", userId, "tasks")),
      ]);

      const birthdays: Birthday[] = [];
      birthdaysSnap.forEach((d) => birthdays.push(d.data() as Birthday));

      const vacations: Vacation[] = [];
      vacationsSnap.forEach((d) => vacations.push(d.data() as Vacation));

      const categoryEvents: CategoryEvent[] = [];
      categoryEventsSnap.forEach((d) => categoryEvents.push(d.data() as CategoryEvent));

      // Строим Map облачных задач
      const cloudMap = new Map<string, Task>();
      tasksSnap.forEach((d) => {
        const data = d.data();
        if (data.status === "done" && data.completedAt) {
          if (new Date(data.completedAt) < yesterday) return;
        }
        cloudMap.set(data.id, normalizeTask(data));
      });

      // Мержим с локальными используя timestamp-приоритет
      const localTasks = loadTasks();
      const localMap = new Map(localTasks.map((t) => [t.id, t]));
      const mergedTasks: Task[] = [];

      cloudMap.forEach((cloudTask) => {
        const localTask = localMap.get(cloudTask.id);
        if (localTask) {
          const cloudTime = cloudTask.updatedAt || cloudTask.completedAt || cloudTask.createdAt || "";
          const localTime = localTask.updatedAt || localTask.completedAt || localTask.createdAt || "";
          mergedTasks.push(cloudTime >= localTime ? cloudTask : localTask);
        } else {
          mergedTasks.push(cloudTask);
        }
      });

      localMap.forEach((localTask) => {
        if (!cloudMap.has(localTask.id)) {
          if (localTask.status === "done" && localTask.completedAt) {
            if (new Date(localTask.completedAt) < yesterday) return;
          }
          mergedTasks.push(localTask);
          saveTaskToFirebase(localTask, userId).catch(console.error);
        }
      });

      saveTasks(mergedTasks);

      const localEvents = loadCategoryEvents();
      const mergedEvents = [...categoryEvents];
      localEvents.forEach((le) => {
        if (!mergedEvents.find((e) => e.id === le.id)) mergedEvents.push(le);
      });
      saveCategoryEventsLocal(mergedEvents);

      set({
        birthdays,
        vacations,
        categoryEvents: mergedEvents,
        tasks: mergedTasks,
        isDataLoaded: true,
      });
    } catch (e) {
      console.error("Load user data error:", e);
      set({ isDataLoaded: true });
    }
  },

  // Исправленный startSync с timestamp-приоритетом
  startSync: (userId) => {
    if (userId === "unknown") return () => {};

    const unsubTasks = onSnapshot(
      collection(db, "users", userId, "tasks"),
      (snapshot) => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // Строим Map облачных задач
        const cloudMap = new Map<string, Task>();
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.status === "done" && data.completedAt) {
            if (new Date(data.completedAt) < yesterday) return;
          }
          cloudMap.set(data.id, normalizeTask(data));
        });

        set((state) => {
          const merged: Task[] = [];
          const localMap = new Map(state.tasks.map((t) => [t.id, t]));

          // Облачные задачи — основа
          cloudMap.forEach((cloudTask) => {
            const localTask = localMap.get(cloudTask.id);
            if (localTask) {
              // Берём более новую версию по updatedAt
              const cloudTime = cloudTask.updatedAt || cloudTask.completedAt || cloudTask.createdAt || "";
              const localTime = localTask.updatedAt || localTask.completedAt || localTask.createdAt || "";
              merged.push(cloudTime >= localTime ? cloudTask : localTask);
            } else {
              merged.push(cloudTask);
            }
          });

          // Локальные задачи которых нет в облаке — pending upload
          localMap.forEach((localTask) => {
            if (!cloudMap.has(localTask.id)) {
              merged.push(localTask);
              // Автоматически синхронизируем в Firebase
              saveTaskToFirebase(localTask, userId).catch(console.error);
            }
          });

          saveTasks(merged);
          return { tasks: merged, isSynced: true };
        });
      },
      (error) => console.error("Sync error:", error)
    );

    return () => unsubTasks();
  },

  cleanupOldTasks: async (userId) => {
    const filtered = await cleanupDoneTasks(userId);
    set({ tasks: filtered });
  },
}));

export function usePersistTasks() {
  useEffect(() => {
    const stored = loadTasks();
    if (stored.length > 0) {
      const current = useTaskStore.getState().tasks;
      if (current.length === 0) useTaskStore.setState({ tasks: stored });
    }

    const userId = getTelegramUserId();
    useTaskStore.getState().loadUserData(userId);
    const unsubscribe = useTaskStore.getState().startSync(userId);
    useTaskStore.getState().cleanupOldTasks(userId);

    return () => unsubscribe();
  }, []);
}

export const RUSSIAN_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "Новый год",
  "2026-01-02": "Новогодние каникулы",
  "2026-01-03": "Новогодние каникулы",
  "2026-01-04": "Новогодние каникулы",
  "2026-01-05": "Новогодние каникулы",
  "2026-01-06": "Новогодние каникулы",
  "2026-01-07": "Рождество Христово",
  "2026-01-08": "Новогодние каникулы",
  "2026-02-23": "День защитника Отечества",
  "2026-03-09": "Международный женский день (перенос)",
  "2026-05-01": "Праздник Весны и Труда",
  "2026-05-04": "Праздник Весны и Труда (перенос)",
  "2026-05-09": "День Победы",
  "2026-05-11": "День Победы (перенос)",
  "2026-06-12": "День России",
  "2026-11-04": "День народного единства",
  "2026-12-31": "Новогодние каникулы (перенос)",
  "2027-01-01": "Новый год",
  "2027-01-02": "Новогодние каникулы",
  "2027-01-03": "Новогодние каникулы",
  "2027-01-04": "Новогодние каникулы",
  "2027-01-05": "Новогодние каникулы",
  "2027-01-06": "Новогодние каникулы",
  "2027-01-07": "Рождество Христово",
  "2027-01-08": "Новогодние каникулы",
  "2027-02-22": "День защитника Отечества (перенос)",
  "2027-03-08": "Международный женский день",
  "2027-05-03": "Праздник Весны и Труда (перенос)",
  "2027-05-09": "День Победы",
  "2027-05-10": "День Победы (перенос)",
  "2027-06-14": "День России (перенос)",
  "2027-11-04": "День народного единства",
  "2027-11-05": "День народного единства (перенос)",
  "2027-12-31": "Новогодние каникулы (перенос)",
};

export function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isHoliday(dateStr: string): boolean {
  return dateStr in RUSSIAN_HOLIDAYS;
}

export function getHolidayName(dateStr: string): string {
  return RUSSIAN_HOLIDAYS[dateStr] || "";
}

export function isRedDay(dateStr: string): boolean {
  return isHoliday(dateStr) || isWeekend(dateStr);
}  type: TaskType;
  items?: string[];
};

export type Birthday = {
  id: string;
  name: string;
  date: string;
  color: string;
};

export type Vacation = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
};

export type CustomCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

export type CategoryEvent = {
  id: string;
  categoryId: string;
  title: string;
  date: string;
  endDate?: string;
  notes?: string;
  color?: string;
};

type TaskStore = {
  tasks: Task[];
  birthdays: Birthday[];
  vacations: Vacation[];
  categories: CustomCategory[];
  categoryEvents: CategoryEvent[];
  selectedDate: string | null;
  isDataLoaded: boolean;
  isSynced: boolean;

  addTask: (task: Omit<Task, "id" | "createdAt" | "notified">) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  toggleTaskStatus: (taskId: string) => void;
  setSelectedDate: (date: string | null) => void;

  addBirthday: (birthday: Omit<Birthday, "id">) => Promise<void>;
  deleteBirthday: (id: string) => Promise<void>;

  addVacation: (vacation: Omit<Vacation, "id">) => Promise<void>;
  deleteVacation: (id: string) => Promise<void>;

  addCategory: (category: Omit<CustomCategory, "id">) => void;
  updateCategory: (id: string, updates: Partial<CustomCategory>) => void;
  deleteCategory: (id: string) => void;

  addCategoryEvent: (event: Omit<CategoryEvent, "id">) => Promise<void>;
  deleteCategoryEvent: (id: string) => Promise<void>;

  loadUserData: (userId: string) => Promise<void>;
  startSync: (userId: string) => () => void;
  cleanupOldTasks: (userId: string) => Promise<void>;
};

const STORAGE_KEY = "cortex-tasks";
const CHAT_STORAGE_KEY = "cortex-ai-chat";
const CATEGORIES_KEY = "cortex-categories";
const CATEGORY_EVENTS_KEY = "cortex-category-events";

export function saveChatHistory(messages: { role: string; content: string }[]) {
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); } catch {}
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
    if (tg.initDataUnsafe?.user?.id) return String(tg.initDataUnsafe.user.id);
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
  } catch { return false; }
}

export async function getSubscriptionInfo(userId: string): Promise<{
  isActive: boolean; expiresAt: Date | null; daysLeft: number;
}> {
  try {
    if (userId === "unknown") return { isActive: false, expiresAt: null, daysLeft: 0 };
    const subDoc = await getDoc(doc(db, "subscriptions", userId));
    if (!subDoc.exists()) return { isActive: false, expiresAt: null, daysLeft: 0 };
    const data = subDoc.data();
    if (!data.isActive || !data.expiresAt) return { isActive: false, expiresAt: null, daysLeft: 0 };
    const expiresAt = data.expiresAt.toDate();
    const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return { isActive: daysLeft > 0, expiresAt, daysLeft };
  } catch { return { isActive: false, expiresAt: null, daysLeft: 0 }; }
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
    completedAt: task.completedAt,
    notified: Boolean(task.notified),
    repeat: task.repeat === "daily" ? "daily" : "none",
    category: task.category || "",
    type: task.type === "shopping" ? "shopping" : "task",
    items: task.items || [],
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch {}
}

function loadCategories(): CustomCategory[] {
  try {
    const stored = localStorage.getItem(CATEGORIES_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [
    { id: "birthdays", name: "Дни рождения", color: "#3b82f6", icon: "🎂" },
    { id: "vacations", name: "Отпуска", color: "#22c55e", icon: "🌴" },
  ];
}

function saveCategories(cats: CustomCategory[]) {
  try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats)); } catch {}
}

function loadCategoryEvents(): CategoryEvent[] {
  try {
    const stored = localStorage.getItem(CATEGORY_EVENTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveCategoryEventsLocal(events: CategoryEvent[]) {
  try { localStorage.setItem(CATEGORY_EVENTS_KEY, JSON.stringify(events)); } catch {}
}

// Только одна запись — в users/{userId}/tasks
async function saveTaskToFirebase(task: Task, userId: string) {
  if (userId === "unknown") return;
  try {
    let reminderAt = null;
    if (task.dueDate) {
      const date = new Date(task.dueDate);
      if (!isNaN(date.getTime())) reminderAt = Timestamp.fromDate(date);
    }
    await setDoc(doc(db, "users", userId, "tasks", task.id), {
      ...task,
      userId,
      isSent: false,
      reminderAt,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  } catch (e: any) {
    console.error("Firebase save error:", e.message);
  }
}

async function deleteTaskFromFirebase(taskId: string, userId: string) {
  if (userId === "unknown") return;
  try {
    await deleteDoc(doc(db, "users", userId, "tasks", taskId));
  } catch (e: any) {
    console.error("Firebase delete error:", e.message);
  }
}

async function cleanupDoneTasks(userId: string): Promise<Task[]> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (userId !== "unknown") {
    try {
      const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
      const batch = writeBatch(db);
      tasksSnap.forEach((d) => {
        const data = d.data();
        if (data.status === "done" && data.completedAt) {
          const completedAt = new Date(data.completedAt);
          if (completedAt < yesterday) {
            batch.delete(doc(db, "users", userId, "tasks", d.id));
          }
        }
      });
      await batch.commit();
    } catch (e) {
      console.error("Cleanup error:", e);
    }
  }

  const localTasks = loadTasks();
  const filtered = localTasks.filter((t) => {
    if (t.status === "done" && t.completedAt) {
      const completedAt = new Date(t.completedAt);
      return completedAt >= yesterday;
    }
    return true;
  });

  saveTasks(filtered);
  return filtered;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: loadTasks(),
  birthdays: [],
  vacations: [],
  categories: loadCategories(),
  categoryEvents: loadCategoryEvents(),
  selectedDate: null,
  isDataLoaded: false,
  isSynced: false,

  // Только одна запись в Firebase
  addTask: async (task) => {
    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      notified: false,
      repeat: task.repeat || "none",
      category: task.category || "",
      type: task.type || "task",
      items: task.items || [],
    };

    // Мгновенно в UI
    set((state) => {
      const updated = [newTask, ...state.tasks];
      saveTasks(updated);
      return { tasks: updated };
    });

    // Только одна запись в users/{userId}/tasks
    const userId = getTelegramUserId();
    saveTaskToFirebase(newTask, userId).catch(console.error);
  },

  updateTask: (taskId, updates) => {
    set((state) => {
      const updated = state.tasks.map((t) =>
        t.id === taskId ? normalizeTask({ ...t, ...updates }) : t
      );
      saveTasks(updated);
      const userId = getTelegramUserId();
      const updatedTask = updated.find((t) => t.id === taskId);
      if (updatedTask) saveTaskToFirebase(updatedTask, userId).catch(console.error);
      return { tasks: updated };
    });
  },

  deleteTask: (taskId) => {
    set((state) => {
      const updated = state.tasks.filter((t) => t.id !== taskId);
      saveTasks(updated);
      const userId = getTelegramUserId();
      deleteTaskFromFirebase(taskId, userId).catch(console.error);
      return { tasks: updated };
    });
  },

  toggleTaskStatus: (taskId) => {
    set((state) => {
      const updated = state.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const newStatus = t.status === "done" ? "todo" : "done";
        return {
          ...t,
          status: newStatus as TaskStatus,
          completedAt: newStatus === "done" ? new Date().toISOString() : undefined,
        };
      });
      saveTasks(updated);
      const userId = getTelegramUserId();
      const updatedTask = updated.find((t) => t.id === taskId);
      if (updatedTask) saveTaskToFirebase(updatedTask, userId).catch(console.error);
      return { tasks: updated };
    });
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  addBirthday: async (birthday) => {
    const id = crypto.randomUUID();
    const newBirthday: Birthday = { ...birthday, id };
    set((state) => ({ birthdays: [...state.birthdays, newBirthday] }));
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      setDoc(doc(db, "users", userId, "birthdays", id), newBirthday).catch(console.error);
    }
  },

  deleteBirthday: async (id) => {
    set((state) => ({ birthdays: state.birthdays.filter((b) => b.id !== id) }));
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      deleteDoc(doc(db, "users", userId, "birthdays", id)).catch(console.error);
    }
  },

  addVacation: async (vacation) => {
    const id = crypto.randomUUID();
    const newVacation: Vacation = { ...vacation, id };
    set((state) => ({ vacations: [...state.vacations, newVacation] }));
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      setDoc(doc(db, "users", userId, "vacations", id), newVacation).catch(console.error);
    }
  },

  deleteVacation: async (id) => {
    set((state) => ({ vacations: state.vacations.filter((v) => v.id !== id) }));
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      deleteDoc(doc(db, "users", userId, "vacations", id)).catch(console.error);
    }
  },

  addCategory: (category) => {
    const id = crypto.randomUUID();
    set((state) => {
      const updated = [...state.categories, { ...category, id }];
      saveCategories(updated);
      return { categories: updated };
    });
  },

  updateCategory: (id, updates) =>
    set((state) => {
      const updated = state.categories.map((c) => c.id === id ? { ...c, ...updates } : c);
      saveCategories(updated);
      return { categories: updated };
    }),

  deleteCategory: (id) =>
    set((state) => {
      const updatedCats = state.categories.filter((c) => c.id !== id);
      const updatedEvents = state.categoryEvents.filter((e) => e.categoryId !== id);
      saveCategories(updatedCats);
      saveCategoryEventsLocal(updatedEvents);
      return { categories: updatedCats, categoryEvents: updatedEvents };
    }),

  addCategoryEvent: async (event) => {
    const id = crypto.randomUUID();
    const newEvent: CategoryEvent = { ...event, id };
    set((state) => {
      const updated = [...state.categoryEvents, newEvent];
      saveCategoryEventsLocal(updated);
      return { categoryEvents: updated };
    });
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      setDoc(doc(db, "users", userId, "categoryEvents", id), newEvent).catch(console.error);
    }
  },

  deleteCategoryEvent: async (id) => {
    set((state) => {
      const updated = state.categoryEvents.filter((e) => e.id !== id);
      saveCategoryEventsLocal(updated);
      return { categoryEvents: updated };
    });
    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      deleteDoc(doc(db, "users", userId, "categoryEvents", id)).catch(console.error);
    }
  },

  loadUserData: async (userId) => {
    if (userId === "unknown") {
      set({ isDataLoaded: true });
      return;
    }
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const [birthdaysSnap, vacationsSnap, categoryEventsSnap, tasksSnap] = await Promise.all([
        getDocs(collection(db, "users", userId, "birthdays")),
        getDocs(collection(db, "users", userId, "vacations")),
        getDocs(collection(db, "users", userId, "categoryEvents")),
        getDocs(collection(db, "users", userId, "tasks")),
      ]);

      const birthdays: Birthday[] = [];
      birthdaysSnap.forEach((d) => birthdays.push(d.data() as Birthday));

      const vacations: Vacation[] = [];
      vacationsSnap.forEach((d) => vacations.push(d.data() as Vacation));

      const categoryEvents: CategoryEvent[] = [];
      categoryEventsSnap.forEach((d) => categoryEvents.push(d.data() as CategoryEvent));

      const cloudTasks: Task[] = [];
      tasksSnap.forEach((d) => {
        const data = d.data();
        if (data.status === "done" && data.completedAt) {
          const completedAt = new Date(data.completedAt);
          if (completedAt < yesterday) return;
        }
        cloudTasks.push(normalizeTask(data));
      });

      const localTasks = loadTasks();
      const mergedTasks = [...cloudTasks];
      localTasks.forEach((lt) => {
        if (!mergedTasks.find((ct) => ct.id === lt.id)) {
          if (lt.status === "done" && lt.completedAt) {
            const completedAt = new Date(lt.completedAt);
            if (completedAt < yesterday) return;
          }
          mergedTasks.push(lt);
          saveTaskToFirebase(lt, userId).catch(console.error);
        }
      });

      saveTasks(mergedTasks);

      const localEvents = loadCategoryEvents();
      const mergedEvents = [...categoryEvents];
      localEvents.forEach((le) => {
        if (!mergedEvents.find((e) => e.id === le.id)) mergedEvents.push(le);
      });
      saveCategoryEventsLocal(mergedEvents);

      set({
        birthdays,
        vacations,
        categoryEvents: mergedEvents,
        tasks: mergedTasks,
        isDataLoaded: true,
      });
    } catch (e) {
      console.error("Load user data error:", e);
      set({ isDataLoaded: true });
    }
  },

  startSync: (userId) => {
    if (userId === "unknown") return () => {};

    const unsubTasks = onSnapshot(
      collection(db, "users", userId, "tasks"),
      (snapshot) => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const cloudTasks: Task[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.status === "done" && data.completedAt) {
            const completedAt = new Date(data.completedAt);
            if (completedAt < yesterday) return;
          }
          cloudTasks.push(normalizeTask(data));
        });

        set((state) => {
          const merged = [...cloudTasks];
          state.tasks.forEach((lt) => {
            if (!merged.find((ct) => ct.id === lt.id)) {
              merged.push(lt);
            }
          });
          saveTasks(merged);
          return { tasks: merged, isSynced: true };
        });
      },
      (error) => console.error("Sync error:", error)
    );

    return () => unsubTasks();
  },

  cleanupOldTasks: async (userId) => {
    const filtered = await cleanupDoneTasks(userId);
    set({ tasks: filtered });
  },
}));

export function usePersistTasks() {
  useEffect(() => {
    const stored = loadTasks();
    if (stored.length > 0) {
      const current = useTaskStore.getState().tasks;
      if (current.length === 0) useTaskStore.setState({ tasks: stored });
    }

    const userId = getTelegramUserId();
    useTaskStore.getState().loadUserData(userId);
    const unsubscribe = useTaskStore.getState().startSync(userId);
    useTaskStore.getState().cleanupOldTasks(userId);

    return () => unsubscribe();
  }, []);
}

export const RUSSIAN_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "Новый год",
  "2026-01-02": "Новогодние каникулы",
  "2026-01-03": "Новогодние каникулы",
  "2026-01-04": "Новогодние каникулы",
  "2026-01-05": "Новогодние каникулы",
  "2026-01-06": "Новогодние каникулы",
  "2026-01-07": "Рождество Христово",
  "2026-01-08": "Новогодние каникулы",
  "2026-02-23": "День защитника Отечества",
  "2026-03-09": "Международный женский день (перенос)",
  "2026-05-01": "Праздник Весны и Труда",
  "2026-05-04": "Праздник Весны и Труда (перенос)",
  "2026-05-09": "День Победы",
  "2026-05-11": "День Победы (перенос)",
  "2026-06-12": "День России",
  "2026-11-04": "День народного единства",
  "2026-12-31": "Новогодние каникулы (перенос)",
  "2027-01-01": "Новый год",
  "2027-01-02": "Новогодние каникулы",
  "2027-01-03": "Новогодние каникулы",
  "2027-01-04": "Новогодние каникулы",
  "2027-01-05": "Новогодние каникулы",
  "2027-01-06": "Новогодние каникулы",
  "2027-01-07": "Рождество Христово",
  "2027-01-08": "Новогодние каникулы",
  "2027-02-22": "День защитника Отечества (перенос)",
  "2027-03-08": "Международный женский день",
  "2027-05-03": "Праздник Весны и Труда (перенос)",
  "2027-05-09": "День Победы",
  "2027-05-10": "День Победы (перенос)",
  "2027-06-14": "День России (перенос)",
  "2027-11-04": "День народного единства",
  "2027-11-05": "День народного единства (перенос)",
  "2027-12-31": "Новогодние каникулы (перенос)",
};

export function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isHoliday(dateStr: string): boolean {
  return dateStr in RUSSIAN_HOLIDAYS;
}

export function getHolidayName(dateStr: string): string {
  return RUSSIAN_HOLIDAYS[dateStr] || "";
}

export function isRedDay(dateStr: string): boolean {
  return isHoliday(dateStr) || isWeekend(dateStr);
}
