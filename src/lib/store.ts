import { create } from "zustand";
import { useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
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
  notified: boolean;
  repeat: TaskRepeat;
  category?: string;
  type: TaskType;
  items?: string[]; // для списка покупок
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

// БЛОК 1: Оптимизация — сохраняем локально МГНОВЕННО, Firebase асинхронно
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
    console.error("Firebase task save error:", e.message);
  }
}

async function deleteTaskFromFirebase(taskId: string, userId: string) {
  if (userId === "unknown") return;
  try {
    await deleteDoc(doc(db, "users", userId, "tasks", taskId));
    // Также помечаем в общей коллекции как удалённое
    const q = query(collection(db, "tasks"), where("taskId", "==", taskId));
    const snap = await getDocs(q);
    snap.forEach(async (d) => {
      await setDoc(doc(db, "tasks", d.id), { ...d.data(), isSent: true, status: "done" });
    });
  } catch (e: any) {
    console.error("Firebase task delete error:", e.message);
  }
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

  // БЛОК 1: Мгновенное сохранение локально + async Firebase
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

    // Мгновенно в UI и localStorage
    set((state) => {
      const updated = [newTask, ...state.tasks];
      saveTasks(updated);
      return { tasks: updated };
    });

    // Firebase асинхронно — не блокируем UI
    const userId = getTelegramUserId();
    Promise.all([
      saveTaskToFirebase(newTask, userId),
      // Также в общую коллекцию для уведомлений бота
      userId !== "unknown" ? addDoc(collection(db, "tasks"), {
        userId,
        taskId: newTask.id,
        title: newTask.title,
        description: newTask.description || "",
        dueDate: newTask.dueDate || null,
        priority: newTask.priority,
        status: newTask.status,
        createdAt: newTask.createdAt,
        isSent: false,
        reminderAt: newTask.dueDate && !isNaN(new Date(newTask.dueDate).getTime())
          ? Timestamp.fromDate(new Date(newTask.dueDate))
          : null,
        repeat: newTask.repeat || "none",
        category: newTask.category || "",
        type: newTask.type || "task",
      }).catch(console.error) : Promise.resolve(),
    ]).catch(console.error);
  },

  updateTask: (taskId, updates) => {
    set((state) => {
      const updated = state.tasks.map((t) =>
        t.id === taskId ? normalizeTask({ ...t, ...updates }) : t
      );
      saveTasks(updated);

      // Async Firebase update
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

      // Async Firebase delete
      const userId = getTelegramUserId();
      deleteTaskFromFirebase(taskId, userId).catch(console.error);

      return { tasks: updated };
    });
  },

  toggleTaskStatus: (taskId) => {
    set((state) => {
      const updated = state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, status: (t.status === "done" ? "todo" : "done") as TaskStatus }
          : t
      );
      saveTasks(updated);

      // Async Firebase update
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
    const newCategory: CustomCategory = { ...category, id };
    set((state) => {
      const updated = [...state.categories, newCategory];
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

  // БЛОК 3: Загрузка данных из Firebase
  loadUserData: async (userId) => {
    if (userId === "unknown") {
      set({ isDataLoaded: true });
      return;
    }
    try {
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

      // БЛОК 3: Синхронизируем задачи с Firebase
      const cloudTasks: Task[] = [];
      tasksSnap.forEach((d) => {
        const data = d.data();
        if (data.status !== "done") {
          cloudTasks.push(normalizeTask(data));
        }
      });

      // Мержим локальные и облачные задачи
      const localTasks = loadTasks();
      const mergedTasks = [...cloudTasks];

      localTasks.forEach((lt) => {
        if (!mergedTasks.find((ct) => ct.id === lt.id)) {
          mergedTasks.push(lt);
          // Синхронизируем локальную задачу в Firebase
          saveTaskToFirebase(lt, userId).catch(console.error);
        }
      });

      // Сохраняем мержированные задачи
      saveTasks(mergedTasks);

      // Мержим category events
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

  // БЛОК 3: Realtime синхронизация между устройствами
  startSync: (userId) => {
    if (userId === "unknown") return () => {};

    // Подписываемся на изменения задач в реальном времени
    const unsubTasks = onSnapshot(
      collection(db, "users", userId, "tasks"),
      (snapshot) => {
        const cloudTasks: Task[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.status !== "done") {
            cloudTasks.push(normalizeTask(data));
          }
        });

        set((state) => {
          // Мержим с локальными (локальные имеют приоритет если новее)
          const merged = [...cloudTasks];
          state.tasks.forEach((lt) => {
            const cloudTask = merged.find((ct) => ct.id === lt.id);
            if (!cloudTask) {
              merged.push(lt);
            }
          });
          saveTasks(merged);
          return { tasks: merged, isSynced: true };
        });
      },
      (error) => {
        console.error("Sync error:", error);
      }
    );

    return () => {
      unsubTasks();
    };
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

    // БЛОК 3: Запускаем realtime синхронизацию
    const unsubscribe = useTaskStore.getState().startSync(userId);
    return () => {
      unsubscribe();
    };
  }, []);
}

// Производственный календарь России 2026-2027
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
  "2026-12-31": "Новогодние каникулы",
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
  "2027-12-31": "Новогодние каникулы",
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
