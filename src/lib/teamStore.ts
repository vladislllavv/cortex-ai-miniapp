import { create } from "zustand";
import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  Unsubscribe,
} from "firebase/firestore";
import { sendNotification, sendNotificationBatch } from "./notifications";

export type Role = "owner" | "admin" | "member";
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
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
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

  createWorkspace: (
    name: string,
    description: string,
    uid: string,
    userName: string,
    photoUrl?: string
  ) => Promise<string>;
  joinByCode: (
    code: string,
    uid: string,
    userName: string,
    username?: string,
    photoUrl?: string
  ) => Promise<string>;
  leaveWorkspace: (wsId: string, uid: string) => Promise<void>;
  deleteWorkspace: (wsId: string) => Promise<void>;

  changeRole: (wsId: string, memberUid: string, role: Role, changedByName: string) => Promise<void>;
  removeMember: (wsId: string, memberUid: string) => Promise<void>;

  createTask: (
    wsId: string,
    data: Omit<TeamTask, "id" | "createdAt" | "completed">
  ) => Promise<void>;
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
    const q = query(
      collection(db, "workspaces"),
      where("memberIds", "array-contains", uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      set({
        workspaces: snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Workspace, "id">),
        })),
      });
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
        set({
          members: snap.docs.map((d) => ({
            uid: d.id,
            ...(d.data() as Omit<Member, "uid">),
          })),
        });
      }
    );

    const tUnsub = onSnapshot(
      collection(db, "workspaces", wsId, "tasks"),
      (snap) => {
        set({
          tasks: snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<TeamTask, "id">),
          })),
        });
      }
    );

    set({ currentWsId: wsId, membersUnsub: mUnsub, tasksUnsub: tUnsub });
  },

  unsubscribeAll: () => {
    const { wsUnsub, membersUnsub, tasksUnsub } = get();
    if (wsUnsub) wsUnsub();
    if (membersUnsub) membersUnsub();
    if (tasksUnsub) tasksUnsub();
    set({
      wsUnsub: null,
      membersUnsub: null,
      tasksUnsub: null,
      workspaces: [],
      members: [],
      tasks: [],
      currentWsId: null,
    });
  },

  createWorkspace: async (name, description, uid, userName, photoUrl) => {
    set({ loading: true });
    try {
      const inviteCode = generateInviteCode();
      const wsRef = await addDoc(collection(db, "workspaces"), {
        name: name.trim(),
        description: description.trim(),
        ownerId: uid,
        ownerName: userName,
        createdAt: Date.now(),
        inviteCode,
        memberIds: [uid],
        emoji: "👥",
      });
      await setDoc(doc(db, "workspaces", wsRef.id, "members", uid), {
        uid,
        displayName: userName,
        photoUrl: photoUrl || "",
        role: "owner" as Role,
        joinedAt: Date.now(),
      });
      return wsRef.id;
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

      if ((data.memberIds as string[]).includes(uid)) {
        throw new Error("ALREADY_MEMBER");
      }

      await setDoc(doc(db, "workspaces", wsId, "members", uid), {
        uid,
        displayName: userName,
        username: username || "",
        photoUrl: photoUrl || "",
        role: "member" as Role,
        joinedAt: Date.now(),
      });
      await updateDoc(doc(db, "workspaces", wsId), {
        memberIds: arrayUnion(uid),
      });

      // 🔔 Уведомление другим участникам что появился новый
      const existingMembers = (data.memberIds as string[]).filter((id) => id !== uid);
      if (existingMembers.length > 0) {
        sendNotificationBatch("member_joined", existingMembers, {
          memberName: userName,
          workspaceName: data.name,
          workspaceId: wsId,
        }).catch(() => {});
      }

      return wsId;
    } finally {
      set({ loading: false });
    }
  },

  leaveWorkspace: async (wsId, uid) => {
    await deleteDoc(doc(db, "workspaces", wsId, "members", uid));
    await updateDoc(doc(db, "workspaces", wsId), {
      memberIds: arrayRemove(uid),
    });
  },

  deleteWorkspace: async (wsId) => {
    const wsSnap = await getDoc(doc(db, "workspaces", wsId));
    const wsData = wsSnap.exists() ? wsSnap.data() : null;

    const [mSnap, tSnap] = await Promise.all([
      getDocs(collection(db, "workspaces", wsId, "members")),
      getDocs(collection(db, "workspaces", wsId, "tasks")),
    ]);

    if (wsData) {
      const memberIds = (wsData.memberIds as string[]) || [];
      const otherMembers = memberIds.filter((id) => id !== wsData.ownerId);
      if (otherMembers.length > 0) {
        sendNotificationBatch("workspace_deleted", otherMembers, {
          workspaceName: wsData.name,
          deletedBy: wsData.ownerName || "Владелец",
        }).catch(() => {});
      }
    }

    await Promise.all([
      ...mSnap.docs.map((d) => deleteDoc(d.ref)),
      ...tSnap.docs.map((d) => deleteDoc(d.ref)),
    ]);
    await deleteDoc(doc(db, "workspaces", wsId));
  },

  changeRole: async (wsId, memberUid, role, changedByName) => {
    await updateDoc(doc(db, "workspaces", wsId, "members", memberUid), { role });

    const ws = get().workspaces.find((w) => w.id === wsId);
    if (ws) {
      sendNotification("role_changed", memberUid, {
        workspaceName: ws.name,
        newRole: role,
        changedBy: changedByName,
      }).catch(() => {});
    }
  },

  removeMember: async (wsId, memberUid) => {
    const ws = get().workspaces.find((w) => w.id === wsId);

    await deleteDoc(doc(db, "workspaces", wsId, "members", memberUid));
    await updateDoc(doc(db, "workspaces", wsId), {
      memberIds: arrayRemove(memberUid),
    });

    if (ws) {
      sendNotification("removed_from_workspace", memberUid, {
        workspaceName: ws.name,
      }).catch(() => {});
    }
  },

  createTask: async (wsId, data) => {
    await addDoc(collection(db, "workspaces", wsId, "tasks"), {
      ...data,
      completed: false,
      createdAt: Date.now(),
    });

    if (data.assigneeId && data.assigneeId !== data.createdBy) {
      const ws = get().workspaces.find((w) => w.id === wsId);
      if (ws) {
        sendNotification("task_assigned", data.assigneeId, {
          taskTitle: data.title,
          workspaceName: ws.name,
          workspaceId: wsId,
          assignedBy: data.createdByName || "Участник команды",
          priority: data.priority,
          dueDate: data.dueDate || undefined,
        }).catch(() => {});
      }
    }
  },

  toggleTask: async (wsId, taskId, completed, completedByName) => {
    const task = get().tasks.find((t) => t.id === taskId);

    await updateDoc(doc(db, "workspaces", wsId, "tasks", taskId), {
      completed: !completed,
      completedAt: !completed ? Date.now() : null,
    });

    if (!completed && task && task.createdBy && completedByName) {
      const ws = get().workspaces.find((w) => w.id === wsId);
      if (ws) {
        const tgUserId = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (String(task.createdBy) !== String(tgUserId)) {
          sendNotification("task_completed", task.createdBy, {
            taskTitle: task.title,
            workspaceName: ws.name,
            workspaceId: wsId,
            completedBy: completedByName,
          }).catch(() => {});
        }
      }
    }
  },

  deleteTask: async (wsId, taskId) => {
    await deleteDoc(doc(db, "workspaces", wsId, "tasks", taskId));
  },

  updateTask: async (wsId, taskId, patch) => {
    const oldTask = get().tasks.find((t) => t.id === taskId);
    await updateDoc(doc(db, "workspaces", wsId, "tasks", taskId), patch);

    if (
      oldTask &&
      patch.assigneeId &&
      patch.assigneeId !== oldTask.assigneeId &&
      patch.assigneeId !== oldTask.createdBy
    ) {
      const ws = get().workspaces.find((w) => w.id === wsId);
      if (ws) {
        sendNotification("task_assigned", patch.assigneeId, {
          taskTitle: oldTask.title,
          workspaceName: ws.name,
          workspaceId: wsId,
          assignedBy: oldTask.createdByName || "Участник команды",
          priority: oldTask.priority,
          dueDate: oldTask.dueDate || undefined,
        }).catch(() => {});
      }
    }
  },
}));
