import { create } from "zustand";
import { useEffect } from "react";
import { db, ensureAuth } from "./firebase";
import {
  collection,
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
import { paths, PERSONAL_WORKSPACE_ID } from "./workspacePaths";

// ============ ТИПЫ ============

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskRepeat =
  | "none"
  | "daily"
  | "weekdays"
  | "weekends"
  | string;
export type TaskType = "task" | "shopping";

export type Task = {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  reminderOffsetMinutes?: number;
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
  workspaceId?: string;
  assigneeUserId?: string;
  createdBy?: string;
  /** Метки/теги для фильтрации */
  tags?: string[];
  /** Порядок сортировки (для drag & drop) */
  sortOrder?: number;
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

// ============ STORE TYPE ============

type TaskStore = {
  tasks: Task[];
  birthdays: Birthday[];
  vacations: Vacation[];
  categories: CustomCategory[];
  categoryEvents: CategoryEvent[];
  selectedDate: string | null;
  isDataLoaded: boolean;
  isSynced: boolean;
  activeWorkspaceId: string;

  setActiveWorkspaceId: (id: string) => void;
  addTask: (
    task: Omit<Task, "id" | "createdAt" | "notified">
  ) => Promise<Task>;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  toggleTaskStatus: (taskId: string) => void;
  setSelectedDate: (date: string | null) => void;

  addBirthday: (b: Omit<Birthday, "id">) => Promise<void>;
  deleteBirthday: (id: string) => Promise<void>;

  addVacation: (v: Omit<Vacation, "id">) => Promise<void>;
  deleteVacation: (id: string) => Promise<void>;

  addCategory: (c: Omit<CustomCategory, "id">) => void;
  updateCategory: (id: string, updates: Partial<CustomCategory>) => void;
  deleteCategory: (id: string) => void;

  addCategoryEvent: (e: Omit<CategoryEvent, "id">) => Promise<void>;
  deleteCategoryEvent: (id: string) => Promise<void>;

  loadUserData: (userId: string, workspaceId: string) => Promise<void>;
  startSync: (userId: string, workspaceId: string) => () => void;
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
  if (userId !== "unknown")
    saveChatToFirebase(userId, "ai-assistant", messages).catch(() => {});
}

export function loadChatHistory(): ChatMessage[] {
  try {
    const s = localStorage.getItem(CHAT_STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return [];
}

export function saveCoachChatHistory(messages: ChatMessage[]) {
  try {
    localStorage.setItem(COACH_CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {}
  const userId = getTelegramUserId();
  if (userId !== "unknown")
    saveChatToFirebase(userId, "ai-coach", messages).catch(() => {});
}

export function loadCoachChatHistory(): ChatMessage[] {
  try {
    const s = localStorage.getItem(COACH_CHAT_STORAGE_KEY);
    if (s) return JSON.parse(s);
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
    await setDoc(doc(db, paths.chat(userId, chatId)), {
      messages: messages.slice(-50),
      updatedAt: new Date().toISOString(),
      userId,
    });
  } catch (e: any) {
    console.error("Chat save:", e.message);
  }
}

export async function loadChatFromFirebase(
  userId: string,
  chatId: string
): Promise<ChatMessage[]> {
  if (userId === "unknown") return [];
  try {
    const snap = await getDoc(doc(db, paths.chat(userId, chatId)));
    if (snap.exists())
      return (snap.data().messages || []) as ChatMessage[];
  } catch {}
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

/** Всегда возвращает валидный userId — Telegram или анонимный из localStorage */
export function getSafeUserId(): string {
  const tgId = getTelegramUserId();
  if (tgId !== "unknown") return tgId;
  // Стабильный анонимный ID
  const key = "cortex-anon-uid";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

// ============ SUBSCRIPTION ============

export async function checkSubscription(userId: string): Promise<boolean> {
  try {
    if (userId === "unknown") return false;
    const d = await getDoc(doc(db, paths.subscription(userId)));
    if (!d.exists()) return false;
    const data = d.data();
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
    const d = await getDoc(doc(db, paths.subscription(userId)));
    if (!d.exists())
      return { isActive: false, expiresAt: null, daysLeft: 0 };
    const data = d.data();
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

// ============ HELPERS ============

function normalizeRepeat(repeat: any): TaskRepeat {
  if (!repeat || repeat === "none") return "none";
  if (repeat === "daily") return "daily";
  if (repeat === "weekdays") return "weekdays";
  if (repeat === "weekends") return "weekends";
  if (typeof repeat === "string" && repeat.startsWith("custom:"))
    return repeat;
  return "none";
}

function normalizeTask(task: any): Task {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || "",
    description: task.description || "",
    dueDate: task.dueDate || undefined,
    reminderOffsetMinutes: task.reminderOffsetMinutes ?? 0,
    priority: task.priority || "medium",
    status: task.status || "todo",
    isAiCreated: Boolean(task.isAiCreated),
    createdAt: task.createdAt || new Date().toISOString(),
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
    notified: Boolean(task.notified),
    repeat: normalizeRepeat(task.repeat),
    category: task.category || "",
    type: task.type === "shopping" ? "shopping" : "task",
    items: task.items || [],
    workspaceId: task.workspaceId || PERSONAL_WORKSPACE_ID,
    assigneeUserId: task.assigneeUserId,
    createdBy: task.createdBy,
    tags: Array.isArray(task.tags) ? task.tags : [],
    sortOrder: task.sortOrder ?? 0,
  };
}

function isRepeatLike(repeat: string): boolean {
  return (
    repeat === "daily" ||
    repeat === "weekdays" ||
    repeat === "weekends" ||
    repeat.startsWith("custom:")
  );
}

function resetDailyLike(tasks: Task[]): Task[] {
  const todayStr = new Date().toISOString().split("T")[0];
  return tasks.map((task) => {
    if (task.status !== "done") return task;
    if (!isRepeatLike(task.repeat)) return task;
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
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(normalizeTask);
    }
  } catch {}
  return [];
}

function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {}
}

function loadCategories(): CustomCategory[] {
  try {
    const s = localStorage.getItem(CATEGORIES_KEY);
    if (s) return JSON.parse(s);
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
    const s = localStorage.getItem(CATEGORY_EVENTS_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return [];
}

function saveCategoryEventsLocal(events: CategoryEvent[]) {
  try {
    localStorage.setItem(CATEGORY_EVENTS_KEY, JSON.stringify(events));
  } catch {}
}

// ============ FIREBASE TASK OPS ============

function computeReminderAt(
  dueDate: string,
  offsetMinutes: number
): Date {
  return new Date(
    new Date(dueDate).getTime() - offsetMinutes * 60 * 1000
  );
}

async function saveTaskToFirebase(
  task: Task,
  userId: string,
  workspaceId: string
) {
  if (!userId || userId === "unknown") return;
  await ensureAuth(); // ensure Firebase Auth before write
  try {
    const offset = task.reminderOffsetMinutes ?? 0;
    let reminderAt = null;
    if (task.dueDate) {
      const d = computeReminderAt(task.dueDate, offset);
      if (!isNaN(d.getTime())) reminderAt = Timestamp.fromDate(d);
    }
    await setDoc(
      doc(db, paths.task(userId, workspaceId, task.id)),
      {
        ...task,
        userId,
        workspaceId,
        isSent: false,
        reminderAt,
        updatedAt: new Date().toISOString(),
      }
    );
  } catch (e: any) {
    console.error("saveTaskToFirebase:", e.message);
  }
}

async function upsertBotTask(
  task: Task,
  userId: string,
  workspaceId: string
) {
  if (!userId || userId === "unknown" || !task.dueDate) return;
  await ensureAuth();
  try {
    const dueDate = new Date(task.dueDate);
    if (isNaN(dueDate.getTime())) return;
    const offset = task.reminderOffsetMinutes ?? 0;
    const reminderAt = computeReminderAt(task.dueDate, offset);
    if (reminderAt <= new Date()) return;

    const existing = await getDocs(
      query(
        collection(db, paths.botTasks()),
        where("taskId", "==", task.id),
        where("userId", "==", userId)
      )
    );

    const data = {
      userId,
      taskId: task.id,
      workspaceId,
      title: task.title,
      description: task.description || "",
      dueDate: task.dueDate,
      priority: task.priority,
      status: task.status,
      createdAt: task.createdAt,
      isSent: false,
      reminderAt: Timestamp.fromDate(reminderAt),
      repeat: task.repeat || "none",
      type: task.type || "task",
      reminderOffsetMinutes: offset,
      updatedAt: new Date().toISOString(),
    };

    if (!existing.empty) {
      await setDoc(
        doc(db, paths.botTasks(), existing.docs[0].id),
        data
      );
    } else {
      const newRef = doc(collection(db, paths.botTasks()));
      await setDoc(newRef, data);
    }
  } catch (e: any) {
    console.error("upsertBotTask:", e.message);
  }
}

async function deleteBotTask(taskId: string, userId: string) {
  if (userId === "unknown") return;
  try {
    const existing = await getDocs(
      query(
        collection(db, paths.botTasks()),
        where("taskId", "==", taskId),
        where("userId", "==", userId)
      )
    );
    const b = writeBatch(db);
    existing.forEach((d) => b.delete(d.ref));
    if (!existing.empty) await b.commit();
  } catch (e: any) {
    console.error("deleteBotTask:", e.message);
  }
}

async function deleteTaskFromFirebase(
  taskId: string,
  userId: string,
  workspaceId: string
) {
  if (!userId || userId === "unknown") return;
  await ensureAuth();
  try {
    await deleteDoc(
      doc(db, paths.task(userId, workspaceId, taskId))
    );
  } catch {}
}

async function syncAllTasksForBot(
  tasks: Task[],
  userId: string,
  workspaceId: string
) {
  if (userId === "unknown") return;
  const now = new Date();
  for (const task of tasks) {
    if (!task.dueDate || task.status === "done") continue;
    const offset = task.reminderOffsetMinutes ?? 0;
    const reminderAt = computeReminderAt(task.dueDate, offset);
    if (reminderAt <= now) continue;
    await upsertBotTask(task, userId, workspaceId).catch(() => {});
  }
}

// ============ MIGRATION ============

export async function migrateTasksIfNeeded(
  userId: string
): Promise<void> {
  if (userId === "unknown") return;
  const MIGRATION_KEY = "cortex-migration-workspace-v1";
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    const legacySnap = await getDocs(
      collection(db, paths.legacyTasks(userId))
    );
    if (legacySnap.empty) {
      localStorage.setItem(MIGRATION_KEY, "1");
      return;
    }

    console.log(
      `[Migration] Migrating ${legacySnap.size} tasks to workspace...`
    );

    const b = writeBatch(db);
    legacySnap.forEach((d) => {
      const data = d.data();
      const newRef = doc(
        db,
        paths.task(userId, PERSONAL_WORKSPACE_ID, d.id)
      );
      b.set(newRef, {
        ...data,
        workspaceId: PERSONAL_WORKSPACE_ID,
        updatedAt: new Date().toISOString(),
      });
    });
    await b.commit();

    localStorage.setItem(MIGRATION_KEY, "1");
    console.log("[Migration] Done ✅");
  } catch (e: any) {
    console.error("[Migration]:", e.message);
  }
}

// ============ STORE ============

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: loadTasks(),
  birthdays: [],
  vacations: [],
  categories: loadCategories(),
  categoryEvents: loadCategoryEvents(),
  selectedDate: null,
  isDataLoaded: false,
  isSynced: false,
  activeWorkspaceId: PERSONAL_WORKSPACE_ID,

  setActiveWorkspaceId: (id) => {
    set({ activeWorkspaceId: id, isDataLoaded: false, tasks: [] });
  },

  addTask: async (task) => {
    const userId = getSafeUserId();
    const workspaceId = get().activeWorkspaceId;
    await ensureAuth(); // ensure auth before Firebase write

    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notified: false,
      repeat: normalizeRepeat(task.repeat),
      category: task.category || "",
      type: task.type || "task",
      items: task.items || [],
      dueDate: task.dueDate || undefined,
      reminderOffsetMinutes: task.reminderOffsetMinutes ?? 0,
      workspaceId,
      createdBy: userId !== "unknown" ? userId : undefined,
    };

    set((state) => {
      const updated = [newTask, ...state.tasks];
      saveTasks(updated);
      return { tasks: updated };
    });

    await saveTaskToFirebase(newTask, userId, workspaceId).catch(
      console.error
    );
    await upsertBotTask(newTask, userId, workspaceId).catch(
      console.error
    );
    return newTask;
  },

  updateTask: (taskId, updates) => {
    const userId = getSafeUserId();
    const workspaceId = get().activeWorkspaceId;

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
      const updatedTask = updated.find((t) => t.id === taskId);
      if (updatedTask) {
        saveTaskToFirebase(
          updatedTask,
          userId,
          workspaceId
        ).catch(console.error);
        if (
          updates.dueDate !== undefined ||
          updates.reminderOffsetMinutes !== undefined
        ) {
          upsertBotTask(
            updatedTask,
            userId,
            workspaceId
          ).catch(console.error);
        }
      }
      return { tasks: updated };
    });
  },

  deleteTask: (taskId) => {
    const userId = getSafeUserId();
    const workspaceId = get().activeWorkspaceId;

    set((state) => {
      const updated = state.tasks.filter((t) => t.id !== taskId);
      saveTasks(updated);
      deleteTaskFromFirebase(taskId, userId, workspaceId).catch(
        console.error
      );
      deleteBotTask(taskId, userId).catch(console.error);
      return { tasks: updated };
    });
  },

  toggleTaskStatus: (taskId) => {
    const userId = getSafeUserId();
    const workspaceId = get().activeWorkspaceId;
    const now = new Date().toISOString();

    set((state) => {
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
      const updatedTask = updated.find((t) => t.id === taskId);
      if (updatedTask)
        saveTaskToFirebase(
          updatedTask,
          userId,
          workspaceId
        ).catch(console.error);
      return { tasks: updated };
    });
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  addBirthday: async (birthday) => {
    const id = crypto.randomUUID();
    const nb: Birthday = { ...birthday, id };
    set((s) => ({ birthdays: [...s.birthdays, nb] }));
    const userId = getSafeUserId();
    await ensureAuth();
    setDoc(doc(db, paths.birthday(userId, id)), nb).catch(
        console.error
      );
  },

  deleteBirthday: async (id) => {
    set((s) => ({
      birthdays: s.birthdays.filter((b) => b.id !== id),
    }));
    const userId = getSafeUserId();
    await ensureAuth();
    deleteDoc(doc(db, paths.birthday(userId, id))).catch(
        console.error
      );
  },

  addVacation: async (vacation) => {
    const id = crypto.randomUUID();
    const nv: Vacation = { ...vacation, id };
    set((s) => ({ vacations: [...s.vacations, nv] }));
    const userId = getSafeUserId();
    await ensureAuth();
    setDoc(doc(db, paths.vacation(userId, id)), nv).catch(
        console.error
      );
  },

  deleteVacation: async (id) => {
    set((s) => ({
      vacations: s.vacations.filter((v) => v.id !== id),
    }));
    const userId = getSafeUserId();
    await ensureAuth();
    deleteDoc(doc(db, paths.vacation(userId, id))).catch(
        console.error
      );
  },

  addCategory: (category) => {
    const id = crypto.randomUUID();
    set((s) => {
      const updated = [...s.categories, { ...category, id }];
      saveCategories(updated);
      return { categories: updated };
    });
  },

  updateCategory: (id, updates) =>
    set((s) => {
      const updated = s.categories.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      );
      saveCategories(updated);
      return { categories: updated };
    }),

  deleteCategory: (id) =>
    set((s) => {
      const cats = s.categories.filter((c) => c.id !== id);
      const events = s.categoryEvents.filter(
        (e) => e.categoryId !== id
      );
      saveCategories(cats);
      saveCategoryEventsLocal(events);
      return { categories: cats, categoryEvents: events };
    }),

  addCategoryEvent: async (event) => {
    const id = crypto.randomUUID();
    const ne: CategoryEvent = { ...event, id };
    set((s) => {
      const updated = [...s.categoryEvents, ne];
      saveCategoryEventsLocal(updated);
      return { categoryEvents: updated };
    });
    const userId = getTelegramUserId();
    if (userId !== "unknown")
      setDoc(
        doc(db, paths.categoryEvent(userId, id)),
        ne
      ).catch(console.error);
  },

  deleteCategoryEvent: async (id) => {
    set((s) => {
      const updated = s.categoryEvents.filter((e) => e.id !== id);
      saveCategoryEventsLocal(updated);
      return { categoryEvents: updated };
    });
    const userId = getTelegramUserId();
    if (userId !== "unknown")
      deleteDoc(
        doc(db, paths.categoryEvent(userId, id))
      ).catch(console.error);
  },

  loadUserData: async (userId, workspaceId) => {
    if (!userId) {
      set({ isDataLoaded: true });
      return;
    }
    await ensureAuth(); // ensure auth before Firebase reads
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const todayStr = new Date().toISOString().split("T")[0];

      const [bSnap, vSnap, ceSnap, tSnap] = await Promise.all([
        getDocs(collection(db, paths.birthdays(userId))),
        getDocs(collection(db, paths.vacations(userId))),
        getDocs(collection(db, paths.categoryEvents(userId))),
        getDocs(
          collection(db, paths.tasks(userId, workspaceId))
        ),
      ]);

      const birthdays: Birthday[] = [];
      bSnap.forEach((d) => birthdays.push(d.data() as Birthday));

      const vacations: Vacation[] = [];
      vSnap.forEach((d) => vacations.push(d.data() as Vacation));

      const categoryEvents: CategoryEvent[] = [];
      ceSnap.forEach((d) =>
        categoryEvents.push(d.data() as CategoryEvent)
      );

      const cloudMap = new Map<string, Task>();
      const batch = writeBatch(db);
      let hasChanges = false;

      tSnap.forEach((d) => {
        const data = d.data();
        const isDailyLike = isRepeatLike(data.repeat || "");

        if (
          data.status === "done" &&
          data.completedAt &&
          !isDailyLike
        ) {
          if (new Date(data.completedAt) < yesterday) {
            batch.delete(d.ref);
            hasChanges = true;
            return;
          }
        }

        if (
          isDailyLike &&
          data.status === "done" &&
          data.completedAt
        ) {
          if (data.completedAt.split("T")[0] < todayStr) {
            const reset = normalizeTask({
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
            });
            hasChanges = true;
            cloudMap.set(d.id, reset);
            return;
          }
        }

        cloudMap.set(d.id, normalizeTask({ ...data, id: d.id }));
      });

      if (hasChanges) await batch.commit();

      const localTasks = loadTasks().filter(
        (t) =>
          (t.workspaceId || PERSONAL_WORKSPACE_ID) === workspaceId
      );
      const localMap = new Map(localTasks.map((t) => [t.id, t]));
      const merged: Task[] = [];

      cloudMap.forEach((cloud) => {
        const local = localMap.get(cloud.id);
        if (local) {
          const ct = cloud.updatedAt || cloud.createdAt || "";
          const lt = local.updatedAt || local.createdAt || "";
          merged.push(ct >= lt ? cloud : local);
        } else {
          merged.push(cloud);
        }
      });

      localMap.forEach((local) => {
        if (!cloudMap.has(local.id)) {
          if (
            local.status === "done" &&
            local.completedAt &&
            local.repeat === "none"
          ) {
            if (new Date(local.completedAt) < yesterday) return;
          }
          merged.push(local);
          saveTaskToFirebase(local, userId, workspaceId).catch(
            console.error
          );
          upsertBotTask(local, userId, workspaceId).catch(
            console.error
          );
        }
      });

      // Сохраняем задачи других workspace из localStorage
      const otherTasks = loadTasks().filter(
        (t) =>
          (t.workspaceId || PERSONAL_WORKSPACE_ID) !== workspaceId
      );
      saveTasks([...otherTasks, ...merged]);

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
        tasks: merged,
        isDataLoaded: true,
      });

      setTimeout(() => {
        syncAllTasksForBot(merged, userId, workspaceId).catch(
          console.error
        );
      }, 2000);
    } catch (e) {
      console.error("loadUserData:", e);
      set({ isDataLoaded: true });
    }
  },

  startSync: (userId, workspaceId) => {
    if (!userId) return () => {};

    const unsub = onSnapshot(
      collection(db, paths.tasks(userId, workspaceId)),
      { includeMetadataChanges: false },
      (snapshot) => {
        if (snapshot.metadata.fromCache) return;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const todayStr = new Date().toISOString().split("T")[0];
        const cloudMap = new Map<string, Task>();

        snapshot.forEach((d) => {
          const data = d.data();
          const isDailyLike = isRepeatLike(data.repeat || "");

          if (
            data.status === "done" &&
            data.completedAt &&
            !isDailyLike &&
            new Date(data.completedAt) < yesterday
          )
            return;

          if (
            isDailyLike &&
            data.status === "done" &&
            data.completedAt &&
            data.completedAt.split("T")[0] < todayStr
          ) {
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

          cloudMap.set(
            d.id,
            normalizeTask({ ...data, id: d.id })
          );
        });

        set((state) => {
          const otherTasks = state.tasks.filter(
            (t) =>
              (t.workspaceId || PERSONAL_WORKSPACE_ID) !==
              workspaceId
          );
          const currentTasks = state.tasks.filter(
            (t) =>
              (t.workspaceId || PERSONAL_WORKSPACE_ID) ===
              workspaceId
          );
          const localMap = new Map(
            currentTasks.map((t) => [t.id, t])
          );
          const merged: Task[] = [];

          cloudMap.forEach((cloud) => {
            const local = localMap.get(cloud.id);
            if (local) {
              const ct =
                cloud.updatedAt || cloud.createdAt || "";
              const lt =
                local.updatedAt || local.createdAt || "";
              merged.push(ct >= lt ? cloud : local);
            } else {
              merged.push(cloud);
            }
          });

          localMap.forEach((local) => {
            if (!cloudMap.has(local.id)) {
              merged.push(local);
              saveTaskToFirebase(
                local,
                userId,
                workspaceId
              ).catch(console.error);
            }
          });

          saveTasks([...otherTasks, ...merged]);
          return { tasks: merged, isSynced: true };
        });
      },
      (err) => console.error("Sync:", err)
    );

    return unsub;
  },
}));

// ============ usePersistTasks ============

export function usePersistTasks() {
  useEffect(() => {
    const stored = loadTasks();
    const reset = resetDailyLike(stored);
    saveTasks(reset);
    useTaskStore.setState({ tasks: reset });

    const userId = getTelegramUserId();
    const workspaceId =
      localStorage.getItem("cortex-active-workspace") ||
      PERSONAL_WORKSPACE_ID;

    migrateTasksIfNeeded(userId).catch(console.error);
    useTaskStore.getState().loadUserData(userId, workspaceId);
    const unsub = useTaskStore
      .getState()
      .startSync(userId, workspaceId);

    return () => unsub();
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
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
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
