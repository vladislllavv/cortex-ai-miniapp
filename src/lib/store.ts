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
  writeBatch,
  query,
  where,
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

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
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

  addTask: (task: Omit<Task, "id" | "createdAt" | "notified">) => Promise<Task>;
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

// ============ STORAGE KEYS ============

const STORAGE_KEY = "cortex-tasks";
const CHAT_STORAGE_KEY = "cortex-ai-chat";
const COACH_CHAT_STORAGE_KEY = "cortex-coach-chat";
const CATEGORIES_KEY = "cortex-categories";
const CATEGORY_EVENTS_KEY = "cortex-category-events";

// ============ CHAT HISTORY ============

export function saveChatHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {}
  const userId = getTelegramUserId();
  if (userId !== "unknown") {
    saveChatToFirebase(userId, "ai-assistant", messages).catch(() => {});
  }
}

export function loadChatHistory(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function saveCoachChatHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(COACH_CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {}
  const userId = getTelegramUserId();
  if (userId !== "unknown") {
    saveChatToFirebase(userId, "ai-coach", messages).catch(() => {});
  }
}

export function loadCoachChatHistory(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(COACH_CHAT_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

async function saveChatToFirebase(
  userId: string,
  chatId: string,
  messages: ChatMessage[]
) {
  if (userId === "unknown") return;
  try {
    const trimmed = messages.slice(-50);
    await setDoc(doc(db, "users", userId, "chats", chatId), {
      messages: trimmed,
      updatedAt: new Date().toISOString(),
      userId,
    });
  } catch (e: any) {
    console.error("Chat save error:", e.message);
  }
}

export async function loadChatFromFirebase(
  userId: string,
  chatId: string
): Promise<ChatMessage[]> {
  if (userId === "unknown") return [];
  try {
    const snap = await getDoc(doc(db, "users", userId, "chats", chatId));
    if (snap.exists()) {
      const data = snap.data();
      return (data.messages || []) as ChatMessage[];
    }
  } catch (e: any) {
    console.error("Chat load error:", e.message);
  }
  return [];
}

// ============ TELEGRAM USER ============

export function getTelegramUserId(): string {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return "unknown";
    if (tg.initDataUnsafe?.user?.id)
      return String(tg.initDataUnsafe.user.id);
  } catch {}
  return "unknown";
}

// ============ SUBSCRIPTION ============

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

export async function getSubscriptionInfo(userId: string): Promise<{
  isActive: boolean;
  expiresAt: Date | null;
  daysLeft: number;
}> {
  try {
    if (userId === "unknown")
      return { isActive: false, expiresAt: null, daysLeft: 0 };
    const subDoc = await getDoc(doc(db, "subscriptions", userId));
    if (!subDoc.exists())
      return { isActive: false, expiresAt: null, daysLeft: 0 };
    const data = subDoc.data();
    if (!data.isActive || !data.expiresAt)
      return { isActive: false, expiresAt: null, daysLeft: 0 };
    const expiresAt = data.expiresAt.toDate();
    const daysLeft = Math.ceil(
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return { isActive: daysLeft > 0, expiresAt, daysLeft };
  } catch {
    return { isActive: false, expiresAt: null, daysLeft: 0 };
  }
}

// ============ TASK HELPERS ============

function normalizeTask(task: any): Task {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || "",
    description: task.description || "",
    dueDate: task.dueDate || undefined,
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

function resetDailyTasks(tasks: Task[]): Task[] {
  const todayStr = new Date().toISOString().split("T")[0];
  return tasks.map((task) => {
    if (task.repeat !== "daily" || task.status !== "done") return task;
    const completedDay = task.completedAt?.split("T")[0];
    if (completedDay && completedDay < todayStr) {
      return {
        ...task,
        status: "todo" as TaskStatus,
        completedAt: undefined,
        updatedAt: new Date().toISOString(),
      };
    }
    return task;
  });
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
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
  } catch {}
}

function loadCategoryEvents(): CategoryEvent[] {
  try {
    const stored = localStorage.getItem(CATEGORY_EVENTS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveCategoryEventsLocal(events: CategoryEvent[]) {
  try {
    localStorage.setItem(CATEGORY_EVENTS_KEY, JSON.stringify(events));
  } catch {}
}

// ============ FIREBASE TASK SYNC ============

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

// ✅ ИСПРАВЛЕНИЕ: сохраняем задачу в корневую /tasks для бота
// Проверяем что такой taskId ещё не существует чтобы не дублировать
async function saveTaskForBot(task: Task, userId: string) {
  if (userId === "unknown" || !task.dueDate) return;
  try {
    const dueDate = new Date(task.dueDate);
    if (isNaN(dueDate.getTime())) return;

    // Не создаём напоминание для прошедших дат
    if (dueDate <= new Date()) return;

    // ✅ Проверяем — нет ли уже такого taskId в /tasks
    const existing = await getDocs(
      query(
        collection(db, "tasks"),
        where("taskId", "==", task.id),
        where("userId", "==", userId)
      )
    );

    // Если уже есть — не дублируем
    if (!existing.empty) return;

    await addDoc(collection(db, "tasks"), {
      userId,
      taskId: task.id,
      title: task.title,
      description: task.description || "",
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt,
      isSent: false,
      reminderAt: Timestamp.fromDate(dueDate),
      repeat: task.repeat || "none",
      type: task.type || "task",
    });

    console.log(`✅ Task saved for bot: ${task.title} at ${task.dueDate}`);
  } catch (e: any) {
    console.error("Bot task save error:", e.message);
  }
}

async function deleteTaskFromFirebase(taskId: string, userId: string) {
  if (userId === "unknown") return;
  try {
    await deleteDoc(doc(db, "users", userId, "tasks", taskId));
  } catch {}
}

// ✅ НОВОЕ: синхронизируем все задачи с датой в корневую /tasks
// Вызывается при загрузке данных — гарантирует что бот видит все задачи
async function syncAllTasksForBot(tasks: Task[], userId: string) {
  if (userId === "unknown") return;

  const now = new Date();

  for (const task of tasks) {
    if (!task.dueDate || task.status === "done") continue;

    const dueDate = new Date(task.dueDate);
    if (isNaN(dueDate.getTime()) || dueDate <= now) continue;

    // saveTaskForBot внутри проверяет дубликаты
    await saveTaskForBot(task, userId).catch(() => {});
  }
}

// ============ STORE ============

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: loadTasks(),
  birthdays: [],
  vacations: [],
  categories: loadCategories(),
  categoryEvents: loadCategoryEvents(),
  selectedDate: null,
  isDataLoaded: false,
  isSynced: false,

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
      dueDate: task.dueDate || undefined,
    };

    set((state) => {
      const updated = [newTask, ...state.tasks];
      saveTasks(updated);
      return { tasks: updated };
    });

    const userId = getTelegramUserId();
    await saveTaskToFirebase(newTask, userId).catch(console.error);
    await saveTaskForBot(newTask, userId).catch(console.error);

    return newTask;
  },

  updateTask: (taskId, updates) => {
    set((state) => {
      const updated = state.tasks.map((t) =>
        t.id === taskId
          ? normalizeTask({
              ...t,
              ...updates,
              updatedAt: new Date().toISOString(),
            })
          : t
      );
      saveTasks(updated);
      const userId = getTelegramUserId();
      const updatedTask = updated.find((t) => t.id === taskId);
      if (updatedTask) {
        saveTaskToFirebase(updatedTask, userId).catch(console.error);
        // ✅ Если обновилась дата — обновляем и в /tasks для бота
        if (updates.dueDate) {
          saveTaskForBot(updatedTask, userId).catch(console.error);
        }
      }
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
      if (updatedTask)
        saveTaskToFirebase(updatedTask, userId).catch(console.error);
      return { tasks: updated };
    });
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  addBirthday: async (birthday) => {
    const id = crypto.randomUUID();
    const newBirthday: Birthday = { ...birthday, id };
    set((state) => ({
      birthdays: [...state.birthdays, newBirthday],
    }));
    const userId = getTelegramUserId();
    if (userId !== "unknown")
      setDoc(
        doc(db, "users", userId, "birthdays", id),
        newBirthday
      ).catch(console.error);
  },

  deleteBirthday: async (id) => {
    set((state) => ({
      birthdays: state.birthdays.filter((b) => b.id !== id),
    }));
    const userId = getTelegramUserId();
    if (userId !== "unknown")
      deleteDoc(
        doc(db, "users", userId, "birthdays", id)
      ).catch(console.error);
  },

  addVacation: async (vacation) => {
    const id = crypto.randomUUID();
    const newVacation: Vacation = { ...vacation, id };
    set((state) => ({
      vacations: [...state.vacations, newVacation],
    }));
    const userId = getTelegramUserId();
    if (userId !== "unknown")
      setDoc(
        doc(db, "users", userId, "vacations", id),
        newVacation
      ).catch(console.error);
  },

  deleteVacation: async (id) => {
    set((state) => ({
      vacations: state.vacations.filter((v) => v.id !== id),
    }));
    const userId = getTelegramUserId();
    if (userId !== "unknown")
      deleteDoc(
        doc(db, "users", userId, "vacations", id)
      ).catch(console.error);
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
      const updatedEvents = state.categoryEvents.filter(
        (e) => e.categoryId !== id
      );
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
    if (userId !== "unknown")
      setDoc(
        doc(db, "users", userId, "categoryEvents", id),
        newEvent
      ).catch(console.error);
  },

  deleteCategoryEvent: async (id) => {
    set((state) => {
      const updated = state.categoryEvents.filter((e) => e.id !== id);
      saveCategoryEventsLocal(updated);
      return { categoryEvents: updated };
    });
    const userId = getTelegramUserId();
    if (userId !== "unknown")
      deleteDoc(
        doc(db, "users", userId, "categoryEvents", id)
      ).catch(console.error);
  },

  loadUserData: async (userId) => {
    if (userId === "unknown") {
      set({ isDataLoaded: true });
      return;
    }
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const todayStr = new Date().toISOString().split("T")[0];

      const [
        birthdaysSnap,
        vacationsSnap,
        categoryEventsSnap,
        tasksSnap,
      ] = await Promise.all([
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
      categoryEventsSnap.forEach((d) =>
        categoryEvents.push(d.data() as CategoryEvent)
      );

      const cloudMap = new Map<string, Task>();
      const batch = writeBatch(db);
      let hasChanges = false;

      tasksSnap.forEach((d) => {
        const data = d.data();

        if (
          data.status === "done" &&
          data.completedAt &&
          data.repeat !== "daily"
        ) {
          if (new Date(data.completedAt) < yesterday) {
            batch.delete(d.ref);
            hasChanges = true;
            return;
          }
        }

        if (
          data.repeat === "daily" &&
          data.status === "done" &&
          data.completedAt
        ) {
          const completedDay = data.completedAt.split("T")[0];
          if (completedDay < todayStr) {
            const resetTask = normalizeTask({
              ...data,
              id: d.id,
              status: "todo",
              completedAt: undefined,
              updatedAt: new Date().toISOString(),
            });
            batch.update(d.ref, {
              status: "todo",
              completedAt: null,
              updatedAt: new Date().toISOString(),
              isSent: false,
            });
            hasChanges = true;
            cloudMap.set(d.id, resetTask);
            return;
          }
        }

        cloudMap.set(d.id, normalizeTask({ ...data, id: d.id }));
      });

      if (hasChanges) await batch.commit();

      const localTasks = loadTasks();
      const localMap = new Map(localTasks.map((t) => [t.id, t]));
      const mergedTasks: Task[] = [];

      cloudMap.forEach((cloudTask) => {
        const localTask = localMap.get(cloudTask.id);
        if (localTask) {
          const cloudTime =
            cloudTask.updatedAt ||
            cloudTask.completedAt ||
            cloudTask.createdAt ||
            "";
          const localTime =
            localTask.updatedAt ||
            localTask.completedAt ||
            localTask.createdAt ||
            "";
          mergedTasks.push(cloudTime >= localTime ? cloudTask : localTask);
        } else {
          mergedTasks.push(cloudTask);
        }
      });

      localMap.forEach((localTask) => {
        if (!cloudMap.has(localTask.id)) {
          if (
            localTask.status === "done" &&
            localTask.completedAt &&
            localTask.repeat !== "daily"
          ) {
            if (new Date(localTask.completedAt) < yesterday) return;
          }
          mergedTasks.push(localTask);
          saveTaskToFirebase(localTask, userId).catch(console.error);
          saveTaskForBot(localTask, userId).catch(console.error);
        }
      });

      saveTasks(mergedTasks);

      const localEvents = loadCategoryEvents();
      const mergedEvents = [...categoryEvents];
      localEvents.forEach((le) => {
        if (!mergedEvents.find((e) => e.id === le.id))
          mergedEvents.push(le);
      });
      saveCategoryEventsLocal(mergedEvents);

      set({
        birthdays,
        vacations,
        categoryEvents: mergedEvents,
        tasks: mergedTasks,
        isDataLoaded: true,
      });

      // ✅ ИСПРАВЛЕНИЕ: после загрузки синхронизируем ВСЕ будущие задачи
      // в корневую /tasks чтобы бот точно их видел
      setTimeout(() => {
        syncAllTasksForBot(mergedTasks, userId).catch(console.error);
      }, 2000);
    } catch (e) {
      console.error("Load user data error:", e);
      set({ isDataLoaded: true });
    }
  },

  startSync: (userId) => {
    if (userId === "unknown") return () => {};

    const unsubTasks = onSnapshot(
      collection(db, "users", userId, "tasks"),
      { includeMetadataChanges: false },
      (snapshot) => {
        if (snapshot.metadata.fromCache) return;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const todayStr = new Date().toISOString().split("T")[0];

        const cloudMap = new Map<string, Task>();

        snapshot.forEach((d) => {
          const data = d.data();

          if (
            data.status === "done" &&
            data.completedAt &&
            data.repeat !== "daily"
          ) {
            if (new Date(data.completedAt) < yesterday) return;
          }

          if (
            data.repeat === "daily" &&
            data.status === "done" &&
            data.completedAt
          ) {
            const completedDay = data.completedAt.split("T")[0];
            if (completedDay < todayStr) {
              cloudMap.set(
                d.id,
                normalizeTask({
                  ...data,
                  id: d.id,
                  status: "todo",
                  completedAt: undefined,
                })
              );
              return;
            }
          }

          cloudMap.set(d.id, normalizeTask({ ...data, id: d.id }));
        });

        set((state) => {
          const merged: Task[] = [];
          const localMap = new Map(state.tasks.map((t) => [t.id, t]));

          cloudMap.forEach((cloudTask) => {
            const localTask = localMap.get(cloudTask.id);
            if (localTask) {
              const cloudTime =
                cloudTask.updatedAt ||
                cloudTask.completedAt ||
                cloudTask.createdAt ||
                "";
              const localTime =
                localTask.updatedAt ||
                localTask.completedAt ||
                localTask.createdAt ||
                "";
              merged.push(cloudTime >= localTime ? cloudTask : localTask);
            } else {
              merged.push(cloudTask);
            }
          });

          localMap.forEach((localTask) => {
            if (!cloudMap.has(localTask.id)) {
              merged.push(localTask);
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
}));

export function usePersistTasks() {
  useEffect(() => {
    const stored = loadTasks();
    const reset = resetDailyTasks(stored);
    saveTasks(reset);
    useTaskStore.setState({ tasks: reset });

    const userId = getTelegramUserId();
    useTaskStore.getState().loadUserData(userId);
    const unsubscribe = useTaskStore.getState().startSync(userId);

    return () => unsubscribe();
  }, []);
}

// ============ HOLIDAYS ============

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
  return date.getDay() === 0 || date.getDay() === 6;
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
