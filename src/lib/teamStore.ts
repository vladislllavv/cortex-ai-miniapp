import { create } from "zustand";
import { db } from "./firebase";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, onSnapshot,
  arrayUnion, arrayRemove, Unsubscribe, writeBatch,
} from "firebase/firestore";
import { sendNotification, sendNotificationBatch } from "./notifications";

export type Role     = "owner" | "admin" | "member";
export type Priority = "low" | "medium" | "high";

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerName?: string;
  createdAt: number;
  inviteCode: string;
  memberIds: string[];
  emoji?: string;
}

export interface Member {
  uid: string;
  displayName: string;
  username?: string;
  photoUrl?: string;
  role: Role;
  joinedAt: number;
}

export interface TeamTask {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  completed: boolean;
  dueDate?: string | null;
  createdBy: string;
  createdByName?: string;
  createdAt: number;
  completedAt?: number | null;
  priority: Priority;
}

export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Получаем или генерируем стабильный анонимный ID для браузерных пользователей */
function getOrCreateAnonId(): string {
  const key = "cortex-anon-uid";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

/** Безопасный ID — Telegram или анонимный */
export function getSafeUserId(telegramUid: string): string {
  if (telegramUid && telegramUid !== "unknown") return telegramUid;
  return getOrCreateAnonId();
}

interface TeamStore {
  workspaces: Workspace[];
  currentWsId: string | null;
  members: Member[];
  tasks: TeamTask[];
  loading: boolean;
  wsUnsub: Unsubscribe | null;
  membersUnsub: Unsubscribe | null;
  tasksUnsub: Unsubscribe | null;

  subscribeWorkspaces: (uid: string) => void;
  selectWorkspace: (wsId: string | null) => void;
  unsubscribeAll: () => void;

  createWorkspace: (name: string, description: string, uid: string, userName: string, photoUrl?: string) => Promise<string>;
  joinByCode: (code: string, uid: string, userName: string, username?: string, photoUrl?: string) => Promise<string>;
  leaveWorkspace: (wsId: string, uid: string) => Promise<void>;
  deleteWorkspace: (wsId: string) => Promise<void>;

  changeRole: (wsId: string, memberUid: string, role: Role, changedByName: string) => Promise<void>;
  removeMember: (wsId: string, memberUid: string) => Promise<void>;

  createTask: (wsId: string, data: Omit<TeamTask, "id" | "completed" | "createdAt">) => Promise<void>;
  toggleTask: (wsId: string, taskId: string, completed: boolean, completedByName?: string) => Promise<void>;
  deleteTask: (wsId: string, taskId: string) => Promise<void>;
  updateTask: (wsId: string, taskId: string, patch: Partial<TeamTask>) => Promise<void>;
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  workspaces: [],
  currentWsId: null,
  members: [],
  tasks: [],
  loading: false,
  wsUnsub: null,
  membersUnsub: null,
  tasksUnsub: null,

  subscribeWorkspaces: (uid) => {
    const prev = get().wsUnsub;
    if (prev) prev();
    if (!uid) return;

    // Слушаем рабочие пространства где пользователь является участником
    const q = query(collection(db, "workspaces"), where("memberIds", "array-contains", uid));
    const unsub = onSnapshot(q, (snap) => {
      set({
        workspaces: snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Workspace, "id">),
        })),
      });
    }, (err) => {
      // Если нет прав — показываем пустой список без ошибки
      console.warn("workspaces subscription:", err.code);
      set({ workspaces: [] });
    });
    set({ wsUnsub: unsub });
  },

  selectWorkspace: (wsId) => {
    const { membersUnsub, tasksUnsub } = get();
    if (membersUnsub) membersUnsub();
    if (tasksUnsub) tasksUnsub();

    if (!wsId) {
      set({ currentWsId: null, members: [], tasks: [], membersUnsub: null, tasksUnsub: null });
      return;
    }

    const mUnsub = onSnapshot(
      collection(db, "workspaces", wsId, "members"),
      (snap) => {
        set({ members: snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Member, "uid">) })) });
      },
      (err) => { console.warn("members subscription:", err.code); }
    );

    const tUnsub = onSnapshot(
      collection(db, "workspaces", wsId, "tasks"),
      (snap) => {
        set({ tasks: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeamTask, "id">) })) });
      },
      (err) => { console.warn("tasks subscription:", err.code); }
    );

    set({ currentWsId: wsId, membersUnsub: mUnsub, tasksUnsub: tUnsub });
  },

  unsubscribeAll: () => {
    const { wsUnsub, membersUnsub, tasksUnsub } = get();
    if (wsUnsub) wsUnsub();
    if (membersUnsub) membersUnsub();
    if (tasksUnsub) tasksUnsub();
    set({ wsUnsub: null, membersUnsub: null, tasksUnsub: null, workspaces: [], members: [], tasks: [], currentWsId: null });
  },

  createWorkspace: async (name, description, uid, userName, photoUrl) => {
    if (!uid || !name.trim()) throw new Error("INVALID_PARAMS");
    set({ loading: true });
    try {
      const inviteCode = generateInviteCode();
      const wsId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      // Используем setDoc с явным ID — обходим проблему с правилами addDoc
      await setDoc(doc(db, "workspaces", wsId), {
        id: wsId,
        name: name.trim(),
        description: description.trim(),
        ownerId: uid,
        ownerName: userName,
        createdAt: Date.now(),
        inviteCode,
        memberIds: [uid],
        emoji: "👥",
      });

      // Добавляем владельца как участника
      await setDoc(doc(db, "workspaces", wsId, "members", uid), {
        uid,
        displayName: userName,
        photoUrl: photoUrl || "",
        role: "owner" as Role,
        joinedAt: Date.now(),
      });

      // Сохраняем ссылку в профиле пользователя для быстрого поиска
      await setDoc(
        doc(db, "users", uid, "teamWorkspaces", wsId),
        { wsId, name: name.trim(), role: "owner", joinedAt: Date.now() },
        { merge: true }
      ).catch(() => {}); // не критично если нет прав

      return wsId;
    } finally {
      set({ loading: false });
    }
  },

  joinByCode: async (code, uid, userName, username, photoUrl) => {
    set({ loading: true });
    try {
      const codeUp = code.trim().toUpperCase();
      const q = query(collection(db, "workspaces"), where("inviteCode", "==", codeUp));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("CODE_NOT_FOUND");

      const wsDoc = snap.docs[0];
      const wsId = wsDoc.id;
      const data = wsDoc.data();

      if ((data.memberIds as string[]).includes(uid)) throw new Error("ALREADY_MEMBER");

      // Добавляем участника
      await setDoc(doc(db, "workspaces", wsId, "members", uid), {
        uid, displayName: userName, username: username || "",
        photoUrl: photoUrl || "", role: "member" as Role, joinedAt: Date.now(),
      });

      // Добавляем UID в массив участников
      await updateDoc(doc(db, "workspaces", wsId), { memberIds: arrayUnion(uid) });

      // Уведомляем других участников
      const existing = (data.memberIds as string[]).filter((id) => id !== uid);
      if (existing.length > 0) {
        sendNotificationBatch("member_joined", existing, {
          memberName: userName, workspaceName: data.name, workspaceId: wsId,
        }).catch(() => {});
      }

      return wsId;
    } finally {
      set({ loading: false });
    }
  },

  leaveWorkspace: async (wsId, uid) => {
    await deleteDoc(doc(db, "workspaces", wsId, "members", uid));
    await updateDoc(doc(db, "workspaces", wsId), { memberIds: arrayRemove(uid) });
  },

  deleteWorkspace: async (wsId) => {
    const wsSnap = await getDoc(doc(db, "workspaces", wsId));
    const wsData = wsSnap.exists() ? wsSnap.data() : null;

    const [mSnap, tSnap] = await Promise.all([
      getDocs(collection(db, "workspaces", wsId, "members")),
      getDocs(collection(db, "workspaces", wsId, "tasks")),
    ]);

    // Уведомляем участников
    if (wsData) {
      const memberIds = (wsData.memberIds as string[]) || [];
      const others = memberIds.filter((id) => id !== wsData.ownerId);
      if (others.length > 0) {
        sendNotificationBatch("workspace_deleted", others, {
          workspaceName: wsData.name, deletedBy: wsData.ownerName || "Owner",
        }).catch(() => {});
      }
    }

    const batch = writeBatch(db);
    mSnap.docs.forEach((d) => batch.delete(d.ref));
    tSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "workspaces", wsId));
    await batch.commit();
  },

  changeRole: async (wsId, memberUid, role, changedByName) => {
    await updateDoc(doc(db, "workspaces", wsId, "members", memberUid), { role });
    const ws = get().workspaces.find((w) => w.id === wsId);
    if (ws) {
      sendNotification("role_changed", memberUid, {
        workspaceName: ws.name, newRole: role, changedBy: changedByName,
      }).catch(() => {});
    }
  },

  removeMember: async (wsId, memberUid) => {
    const ws = get().workspaces.find((w) => w.id === wsId);
    await deleteDoc(doc(db, "workspaces", wsId, "members", memberUid));
    await updateDoc(doc(db, "workspaces", wsId), { memberIds: arrayRemove(memberUid) });
    if (ws) {
      sendNotification("removed_from_workspace", memberUid, { workspaceName: ws.name }).catch(() => {});
    }
  },

  createTask: async (wsId, data) => {
    const taskRef = doc(collection(db, "workspaces", wsId, "tasks"));
    await setDoc(taskRef, { ...data, id: taskRef.id, completed: false, createdAt: Date.now() });

    if (data.assigneeId && data.assigneeId !== data.createdBy) {
      const ws = get().workspaces.find((w) => w.id === wsId);
      if (ws) {
        sendNotification("task_assigned", data.assigneeId, {
          taskTitle: data.title, workspaceName: ws.name, workspaceId: wsId,
          assignedBy: data.createdByName || "teammate",
        }).catch(() => {});
      }
    }
  },

  toggleTask: async (wsId, taskId, completed, completedByName) => {
    const patch: Partial<TeamTask> = { completed, completedAt: completed ? Date.now() : null };
    await updateDoc(doc(db, "workspaces", wsId, "tasks", taskId), patch);

    if (completed && completedByName) {
      const task = get().tasks.find((t) => t.id === taskId);
      const ws   = get().workspaces.find((w) => w.id === wsId);
      if (task?.createdBy && task.createdBy !== get().currentWsId && ws) {
        sendNotification("task_completed", task.createdBy, {
          taskTitle: task.title, completedBy: completedByName, workspaceName: ws.name,
        }).catch(() => {});
      }
    }
  },

  deleteTask: async (wsId, taskId) => {
    await deleteDoc(doc(db, "workspaces", wsId, "tasks", taskId));
  },

  updateTask: async (wsId, taskId, patch) => {
    await updateDoc(doc(db, "workspaces", wsId, "tasks", taskId), patch as any);
  },
}));
