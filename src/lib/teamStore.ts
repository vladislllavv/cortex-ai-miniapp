import { create } from "zustand";
import { db } from "./firebase";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, onSnapshot,
  arrayUnion, arrayRemove, Unsubscribe, writeBatch,
} from "firebase/firestore";

export type Role     = "owner" | "admin" | "member" | "viewer";
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
  /** Личное сообщение исполнителю */
  note?: string;
}

export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Стабильный userId — Telegram или анонимный */
export function getSafeUserId(telegramUid: string): string {
  if (telegramUid && telegramUid !== "unknown") return telegramUid;
  const key = "cortex-anon-uid";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

/** Права на создание/редактирование задач */
export function canCreateTasks(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

/** Может ли редактировать/удалять участников */
export function canManageMembers(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/** Может ли удалять пространство */
export function canDeleteWorkspace(role: Role): boolean {
  return role === "owner";
}

interface TeamStore {
  workspaces:   Workspace[];
  currentWsId:  string | null;
  members:      Member[];
  tasks:        TeamTask[];
  loading:      boolean;

  wsUnsub:      Unsubscribe | null;
  membersUnsub: Unsubscribe | null;
  tasksUnsub:   Unsubscribe | null;

  subscribeWorkspaces: (uid: string) => void;
  selectWorkspace:     (wsId: string | null) => void;
  unsubscribeAll:      () => void;

  createWorkspace: (name: string, desc: string, uid: string, userName: string, photoUrl?: string) => Promise<string>;
  joinByCode:      (code: string, uid: string, userName: string, username?: string, photoUrl?: string) => Promise<string>;
  leaveWorkspace:  (wsId: string, uid: string) => Promise<void>;
  deleteWorkspace: (wsId: string) => Promise<void>;

  changeRole:   (wsId: string, memberUid: string, role: Role, changedByName: string) => Promise<void>;
  removeMember: (wsId: string, memberUid: string) => Promise<void>;

  createTask: (wsId: string, data: Omit<TeamTask, "id" | "completed" | "createdAt">) => Promise<void>;
  toggleTask: (wsId: string, taskId: string, completed: boolean, completedByName?: string) => Promise<void>;
  deleteTask: (wsId: string, taskId: string) => Promise<void>;
  updateTask: (wsId: string, taskId: string, patch: Partial<TeamTask>) => Promise<void>;
}

export const useTeamStore = create<TeamStore>((set, get) => ({
  workspaces: [], currentWsId: null, members: [], tasks: [], loading: false,
  wsUnsub: null, membersUnsub: null, tasksUnsub: null,

  subscribeWorkspaces: (uid) => {
    const prev = get().wsUnsub;
    if (prev) prev();
    if (!uid) return;

    const q = query(collection(db, "workspaces"), where("memberIds", "array-contains", uid));
    const unsub = onSnapshot(q,
      (snap) => {
        set({ workspaces: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Workspace, "id">) })) });
      },
      (err) => {
        console.warn("workspaces subscription:", err.code);
        set({ workspaces: [] });
      }
    );
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
      (err) => { console.warn("members sub:", err.code); }
    );

    const tUnsub = onSnapshot(
      collection(db, "workspaces", wsId, "tasks"),
      (snap) => {
        set({ tasks: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeamTask, "id">) })) });
      },
      (err) => { console.warn("tasks sub:", err.code); }
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

  createWorkspace: async (name, desc, uid, userName, photoUrl) => {
    if (!uid || !name.trim()) throw new Error("INVALID_PARAMS");
    set({ loading: true });
    try {
      const inviteCode = generateInviteCode();
      const wsId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      await setDoc(doc(db, "workspaces", wsId), {
        id: wsId,
        name: name.trim(),
        description: desc.trim(),
        ownerId: uid,
        ownerName: userName,
        createdAt: Date.now(),
        inviteCode,
        memberIds: [uid],
        emoji: "👥",
      });

      await setDoc(doc(db, "workspaces", wsId, "members", uid), {
        uid, displayName: userName,
        photoUrl: photoUrl || "",
        role: "owner" as Role,
        joinedAt: Date.now(),
      });

      return wsId;
    } finally {
      set({ loading: false });
    }
  },

  joinByCode: async (code, uid, userName, username, photoUrl) => {
    if (!uid || !code.trim()) throw new Error("INVALID_PARAMS");
    set({ loading: true });
    try {
      const codeUp = code.trim().toUpperCase();

      // Ищем пространство по коду
      const q    = query(collection(db, "workspaces"), where("inviteCode", "==", codeUp));
      const snap = await getDocs(q);

      if (snap.empty) throw new Error("CODE_NOT_FOUND");

      const wsDoc = snap.docs[0];
      const wsId  = wsDoc.id;
      const data  = wsDoc.data();
      const memberIds = (data.memberIds as string[]) || [];

      if (memberIds.includes(uid)) throw new Error("ALREADY_MEMBER");

      // Добавляем участника — роль "member" по умолчанию
      await setDoc(doc(db, "workspaces", wsId, "members", uid), {
        uid,
        displayName: userName,
        username:    username || "",
        photoUrl:    photoUrl || "",
        role:        "member" as Role,
        joinedAt:    Date.now(),
      });

      // Добавляем uid в массив участников
      await updateDoc(doc(db, "workspaces", wsId), {
        memberIds: arrayUnion(uid),
      });

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
    const [mSnap, tSnap] = await Promise.all([
      getDocs(collection(db, "workspaces", wsId, "members")),
      getDocs(collection(db, "workspaces", wsId, "tasks")),
    ]);
    const batch = writeBatch(db);
    mSnap.docs.forEach((d) => batch.delete(d.ref));
    tSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, "workspaces", wsId));
    await batch.commit();
  },

  changeRole: async (wsId, memberUid, role, _changedByName) => {
    await updateDoc(doc(db, "workspaces", wsId, "members", memberUid), { role });
  },

  removeMember: async (wsId, memberUid) => {
    await deleteDoc(doc(db, "workspaces", wsId, "members", memberUid));
    await updateDoc(doc(db, "workspaces", wsId), { memberIds: arrayRemove(memberUid) });
  },

  createTask: async (wsId, data) => {
    const taskRef = doc(collection(db, "workspaces", wsId, "tasks"));
    await setDoc(taskRef, {
      ...data,
      id: taskRef.id,
      completed: false,
      completedAt: null,
      createdAt: Date.now(),
    });
  },

  toggleTask: async (wsId, taskId, completed, completedByName) => {
    await updateDoc(doc(db, "workspaces", wsId, "tasks", taskId), {
      completed,
      completedAt: completed ? Date.now() : null,
      ...(completedByName ? { completedByName } : {}),
    });
  },

  deleteTask: async (wsId, taskId) => {
    await deleteDoc(doc(db, "workspaces", wsId, "tasks", taskId));
  },

  updateTask: async (wsId, taskId, patch) => {
    await updateDoc(doc(db, "workspaces", wsId, "tasks", taskId), patch as any);
  },
}));
