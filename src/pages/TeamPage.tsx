import { useState, useEffect } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuthStore } from "@/lib/authStore";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import {
  Plus,
  Users,
  Copy,
  Check,
  Crown,
  Shield,
  User,
  Trash2,
  BarChart2,
  CheckSquare,
  Clock,
  UserPlus,
  X,
  ChevronRight,
  AlertCircle,
} from "lucide-react";

// ─── Типы ─────────────────────────────────────────────────────────────────

type Role = "owner" | "admin" | "member";

interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: number;
  inviteCode: string;
  memberCount?: number;
}

interface Member {
  uid: string;
  displayName: string;
  email?: string;
  role: Role;
  joinedAt: number;
}

interface TeamTask {
  id: string;
  title: string;
  assigneeId?: string;
  assigneeName?: string;
  completed: boolean;
  dueDate?: string;
  createdBy: string;
  createdAt: number;
  priority: "low" | "medium" | "high";
}

interface WorkspaceStats {
  totalTasks: number;
  completedTasks: number;
  memberCount: number;
  activeMemberCount: number;
}

// ─── Утилиты ──────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

function RoleBadge({ role, ru }: { role: Role; ru: boolean }) {
  const cfg: Record<Role, { icon: typeof Crown; color: string; label: string }> = {
    owner:  { icon: Crown,  color: "#f59e0b", label: ru ? "Владелец" : "Owner"  },
    admin:  { icon: Shield, color: "#6366f1", label: ru ? "Админ"    : "Admin"  },
    member: { icon: User,   color: "#22c55e", label: ru ? "Участник" : "Member" },
  };
  const { icon: Icon, color, label } = cfg[role];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        backgroundColor: `${color}20`,
        borderRadius: "6px",
        padding: "2px 8px",
      }}
    >
      <Icon size={11} color={color} />
      <span style={{ fontSize: "11px", color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// ─── Главный компонент ────────────────────────────────────────────────────

export default function TeamPage() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const { user } = useAuthStore();

  // Список пространств
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWs, setCurrentWs] = useState<Workspace | null>(null);
  const [myRole, setMyRole] = useState<Role>("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);

  // UI
  const [view, setView] = useState<
    "list" | "workspace" | "create" | "join" | "tasks" | "invite" | "stats"
  >("list");
  const [newWsName, setNewWsName] = useState("");
  const [newWsDesc, setNewWsDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [copiedCode, setCopiedCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userDisplayName, setUserDisplayName] = useState("");

  // Загрузка имени
  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setUserDisplayName(d.displayName || d.name || user.uid.slice(0, 6));
      }
    });
  }, [user?.uid]);

  // Загрузка пространств
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, "workspaces"),
      where("memberIds", "array-contains", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      setWorkspaces(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Workspace, "id">) }))
      );
    });
    return unsub;
  }, [user?.uid]);

  // При выборе пространства — загрузить участников и задачи
  useEffect(() => {
    if (!currentWs || !user?.uid) return;

    // Роль текущего пользователя
    getDoc(doc(db, "workspaces", currentWs.id, "members", user.uid)).then(
      (snap) => {
        if (snap.exists()) setMyRole((snap.data().role as Role) || "member");
      }
    );

    // Участники
    const mUnsub = onSnapshot(
      collection(db, "workspaces", currentWs.id, "members"),
      (snap) => {
        setMembers(
          snap.docs.map((d) => ({
            uid: d.id,
            ...(d.data() as Omit<Member, "uid">),
          }))
        );
      }
    );

    // Задачи
    const tUnsub = onSnapshot(
      query(
        collection(db, "workspaces", currentWs.id, "tasks"),
      ),
      (snap) => {
        const ts = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TeamTask, "id">),
        }));
        setTasks(ts);
        // Статистика
        setStats({
          totalTasks: ts.length,
          completedTasks: ts.filter((t) => t.completed).length,
          memberCount: members.length,
          activeMemberCount: members.length,
        });
      }
    );

    return () => { mUnsub(); tUnsub(); };
  }, [currentWs?.id]);

  // Пересчёт статистики при изменении участников
  useEffect(() => {
    if (!stats) return;
    setStats((s) =>
      s ? { ...s, memberCount: members.length, activeMemberCount: members.length } : s
    );
  }, [members.length]);

  // ── Создание пространства ─────────────────────────────────────────────

  const createWorkspace = async () => {
    if (!newWsName.trim() || !user?.uid) return;
    setLoading(true);
    setError("");
    try {
      const inviteCode = generateInviteCode();
      const wsRef = await addDoc(collection(db, "workspaces"), {
        name: newWsName.trim(),
        description: newWsDesc.trim(),
        ownerId: user.uid,
        createdAt: Date.now(),
        inviteCode,
        memberIds: [user.uid],
      });
      // Добавить себя как owner
      await setDoc(doc(db, "workspaces", wsRef.id, "members", user.uid), {
        uid: user.uid,
        displayName: userDisplayName,
        role: "owner",
        joinedAt: Date.now(),
      });
      setNewWsName("");
      setNewWsDesc("");
      setView("list");
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  // ── Вступление по коду ────────────────────────────────────────────────

  const joinWorkspace = async () => {
    if (!joinCode.trim() || !user?.uid) return;
    setLoading(true);
    setError("");
    try {
      const code = joinCode.trim().toUpperCase();
      const q = query(
        collection(db, "workspaces"),
        where("inviteCode", "==", code)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError(ru ? "Код не найден" : "Code not found");
        setLoading(false);
        return;
      }
      const wsDoc = snap.docs[0];
      const wsId = wsDoc.id;
      const wsData = wsDoc.data();

      // Проверить, уже участник
      if ((wsData.memberIds as string[]).includes(user.uid)) {
        setError(ru ? "Ты уже в этом пространстве" : "Already a member");
        setLoading(false);
        return;
      }

      // Добавить участника
      await setDoc(doc(db, "workspaces", wsId, "members", user.uid), {
        uid: user.uid,
        displayName: userDisplayName,
        role: "member",
        joinedAt: Date.now(),
      });
      await updateDoc(doc(db, "workspaces", wsId), {
        memberIds: [...(wsData.memberIds as string[]), user.uid],
      });

      setJoinCode("");
      setView("list");
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  // ── Копировать инвайт-код ─────────────────────────────────────────────

  const copyInviteCode = () => {
    if (!currentWs) return;
    navigator.clipboard.writeText(currentWs.inviteCode).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ── Изменение роли ────────────────────────────────────────────────────

  const changeRole = async (uid: string, newRole: Role) => {
    if (!currentWs) return;
    await updateDoc(doc(db, "workspaces", currentWs.id, "members", uid), {
      role: newRole,
    });
  };

  // ── Удалить участника ─────────────────────────────────────────────────

  const removeMember = async (uid: string) => {
    if (!currentWs || !user?.uid) return;
    await deleteDoc(doc(db, "workspaces", currentWs.id, "members", uid));
    const wsData = (await getDoc(doc(db, "workspaces", currentWs.id))).data();
    if (wsData) {
      await updateDoc(doc(db, "workspaces", currentWs.id), {
        memberIds: (wsData.memberIds as string[]).filter((id) => id !== uid),
      });
    }
  };

  // ── Создать задачу ────────────────────────────────────────────────────

  const createTask = async () => {
    if (!newTaskTitle.trim() || !currentWs || !user?.uid) return;
    const assignee = members.find((m) => m.uid === newTaskAssignee);
    await addDoc(collection(db, "workspaces", currentWs.id, "tasks"), {
      title: newTaskTitle.trim(),
      assigneeId: newTaskAssignee || null,
      assigneeName: assignee?.displayName || null,
      completed: false,
      createdBy: user.uid,
      createdAt: Date.now(),
      priority: newTaskPriority,
    });
    setNewTaskTitle("");
    setNewTaskAssignee("");
    setNewTaskPriority("medium");
  };

  // ── Переключить выполнение задачи ─────────────────────────────────────

  const toggleTask = async (taskId: string, completed: boolean) => {
    if (!currentWs) return;
    await updateDoc(doc(db, "workspaces", currentWs.id, "tasks", taskId), {
      completed: !completed,
    });
  };

  // ── Удалить задачу ────────────────────────────────────────────────────

  const deleteTask = async (taskId: string) => {
    if (!currentWs) return;
    await deleteDoc(doc(db, "workspaces", currentWs.id, "tasks", taskId));
  };

  // ─────────────────────────────────────────────────────────────────────
  // РЕНДЕР
  // ─────────────────────────────────────────────────────────────────────

  const canManage = myRole === "owner" || myRole === "admin";

  // ── Вид: Список пространств ───────────────────────────────────────────
  if (view === "list") {
    return (
      <div style={{ paddingTop: "4px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "20px",
          }}
        >
          <p style={{ fontSize: "20px", fontWeight: 700, color: "white", margin: 0 }}>
            {ru ? "Команды" : "Teams"}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => { setError(""); setView("join"); }}
              style={btnStyleSmall}
            >
              <UserPlus size={14} />
              {ru ? "Вступить" : "Join"}
            </button>
            <button
              onClick={() => { setError(""); setView("create"); }}
              style={{ ...btnStyleSmall, backgroundColor: theme.primary }}
            >
              <Plus size={14} />
              {ru ? "Создать" : "Create"}
            </button>
          </div>
        </div>

        {workspaces.length === 0 ? (
          <div style={emptyBox}>
            <Users size={40} color="rgba(255,255,255,0.2)" />
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px", textAlign: "center", margin: "12px 0 0" }}>
              {ru
                ? "У тебя пока нет командных пространств.\nСоздай новое или вступи по коду."
                : "No team workspaces yet.\nCreate one or join with a code."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  setCurrentWs(ws);
                  setView("workspace");
                }}
                style={wsCard}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    backgroundColor: `${theme.primary}25`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "22px",
                    flexShrink: 0,
                  }}
                >
                  👥
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <p style={{ fontSize: "15px", fontWeight: 600, color: "white", margin: 0 }}>
                    {ws.name}
                  </p>
                  {ws.description && (
                    <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                      {ws.description}
                    </p>
                  )}
                </div>
                {ws.ownerId === user?.uid && (
                  <Crown size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                )}
                <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Вид: Создать пространство ─────────────────────────────────────────
  if (view === "create") {
    return (
      <div>
        <BackHeader title={ru ? "Новое пространство" : "New Workspace"} onBack={() => setView("list")} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={labelStyle}>{ru ? "Название *" : "Name *"}</label>
            <input
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              placeholder={ru ? "Например: Команда Альфа" : "e.g. Team Alpha"}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>{ru ? "Описание" : "Description"}</label>
            <input
              value={newWsDesc}
              onChange={(e) => setNewWsDesc(e.target.value)}
              placeholder={ru ? "Кратко о команде" : "Short description"}
              style={inputStyle}
            />
          </div>
          {error && <ErrorBox text={error} />}
          <button
            onClick={createWorkspace}
            disabled={!newWsName.trim() || loading}
            style={primaryBtn(theme.primary, !newWsName.trim() || loading)}
          >
            {loading ? "..." : ru ? "Создать пространство" : "Create Workspace"}
          </button>
        </div>
      </div>
    );
  }

  // ── Вид: Вступить по коду ─────────────────────────────────────────────
  if (view === "join") {
    return (
      <div>
        <BackHeader title={ru ? "Вступить в команду" : "Join Team"} onBack={() => setView("list")} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={labelStyle}>{ru ? "Код приглашения" : "Invite Code"}</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX"
              maxLength={8}
              style={{ ...inputStyle, letterSpacing: "4px", fontWeight: 700, fontSize: "18px" }}
            />
          </div>
          {error && <ErrorBox text={error} />}
          <button
            onClick={joinWorkspace}
            disabled={joinCode.length !== 8 || loading}
            style={primaryBtn(theme.primary, joinCode.length !== 8 || loading)}
          >
            {loading ? "..." : ru ? "Вступить" : "Join"}
          </button>
        </div>
      </div>
    );
  }

  // ── Вид: Внутри пространства ──────────────────────────────────────────
  if (view === "workspace" && currentWs) {
    const navItems = [
      { id: "tasks",  icon: CheckSquare, label: ru ? "Задачи"    : "Tasks"   },
      { id: "invite", icon: UserPlus,    label: ru ? "Пригласить": "Invite"  },
      { id: "stats",  icon: BarChart2,   label: ru ? "Статистика": "Stats"   },
    ] as const;

    return (
      <div>
        <BackHeader
          title={currentWs.name}
          onBack={() => { setCurrentWs(null); setView("list"); }}
          right={<RoleBadge role={myRole} ru={ru} />}
        />

        {/* Участники */}
        <div style={sectionCard}>
          <p style={sectionTitle}>{ru ? `Участники (${members.length})` : `Members (${members.length})`}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {members.map((m) => (
              <div key={m.uid} style={memberRow}>
                <div style={avatar(theme.primary)}>
                  {m.displayName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "14px", fontWeight: 600, color: "white", margin: 0 }}>
                    {m.displayName}
                    {m.uid === user?.uid && (
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px", marginLeft: "6px" }}>
                        ({ru ? "ты" : "you"})
                      </span>
                    )}
                  </p>
                </div>
                {canManage && m.uid !== user?.uid ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.uid, e.target.value as Role)}
                    style={roleSelect}
                  >
                    <option value="member">{ru ? "Участник" : "Member"}</option>
                    <option value="admin">{ru ? "Админ" : "Admin"}</option>
                    {myRole === "owner" && <option value="owner">{ru ? "Владелец" : "Owner"}</option>}
                  </select>
                ) : (
                  <RoleBadge role={m.role} ru={ru} />
                )}
                {myRole === "owner" && m.uid !== user?.uid && (
                  <button onClick={() => removeMember(m.uid)} style={iconBtn}>
                    <X size={13} color="rgba(255,68,68,0.7)" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Навигация */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          {navItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                flex: 1,
                padding: "10px 4px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.07)",
                backgroundColor: "rgba(255,255,255,0.05)",
                color: "white",
                fontSize: "11px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Icon size={18} color={theme.primary} />
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Вид: Задачи ───────────────────────────────────────────────────────
  if (view === "tasks" && currentWs) {
    const priorityColors = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
    return (
      <div>
        <BackHeader
          title={ru ? "Общие задачи" : "Shared Tasks"}
          onBack={() => setView("workspace")}
        />

        {/* Форма добавления */}
        {canManage && (
          <div style={{ ...sectionCard, marginBottom: "12px" }}>
            <p style={sectionTitle}>{ru ? "Новая задача" : "New Task"}</p>
            <input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={ru ? "Название задачи..." : "Task title..."}
              style={{ ...inputStyle, marginBottom: "8px" }}
            />
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <select
                value={newTaskAssignee}
                onChange={(e) => setNewTaskAssignee(e.target.value)}
                style={{ ...roleSelect, flex: 1 }}
              >
                <option value="">{ru ? "Не назначено" : "Unassigned"}</option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>{m.displayName}</option>
                ))}
              </select>
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as "low" | "medium" | "high")}
                style={{ ...roleSelect, width: "auto" }}
              >
                <option value="low">{ru ? "Низкий" : "Low"}</option>
                <option value="medium">{ru ? "Средний" : "Medium"}</option>
                <option value="high">{ru ? "Высокий" : "High"}</option>
              </select>
            </div>
            <button
              onClick={createTask}
              disabled={!newTaskTitle.trim()}
              style={primaryBtn(theme.primary, !newTaskTitle.trim())}
            >
              <Plus size={14} />
              {ru ? "Добавить задачу" : "Add Task"}
            </button>
          </div>
        )}

        {/* Список задач */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {tasks.length === 0 ? (
            <div style={emptyBox}>
              <CheckSquare size={36} color="rgba(255,255,255,0.2)" />
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "10px" }}>
                {ru ? "Задач пока нет" : "No tasks yet"}
              </p>
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} style={taskCard}>
                <button
                  onClick={() => toggleTask(task.id, task.completed)}
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "6px",
                    border: `2px solid ${task.completed ? theme.primary : "rgba(255,255,255,0.2)"}`,
                    backgroundColor: task.completed ? theme.primary : "transparent",
                    cursor: "pointer",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {task.completed && <Check size={12} color="white" />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "14px",
                      color: task.completed ? "rgba(255,255,255,0.35)" : "white",
                      margin: 0,
                      textDecoration: task.completed ? "line-through" : "none",
                      fontWeight: 500,
                    }}
                  >
                    {task.title}
                  </p>
                  {task.assigneeName && (
                    <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                      → {task.assigneeName}
                    </p>
                  )}
                </div>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: priorityColors[task.priority],
                    flexShrink: 0,
                  }}
                />
                {canManage && (
                  <button onClick={() => deleteTask(task.id)} style={iconBtn}>
                    <Trash2 size={13} color="rgba(255,100,100,0.6)" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Вид: Приглашение ──────────────────────────────────────────────────
  if (view === "invite" && currentWs) {
    return (
      <div>
        <BackHeader
          title={ru ? "Пригласить участника" : "Invite Member"}
          onBack={() => setView("workspace")}
        />
        <div style={sectionCard}>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "0 0 16px" }}>
            {ru
              ? "Поделись кодом приглашения. Участник введёт его на экране «Вступить»."
              : "Share the invite code. The member enters it on the Join screen."}
          </p>
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              borderRadius: "14px",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "20px",
              textAlign: "center",
              marginBottom: "12px",
            }}
          >
            <p
              style={{
                fontSize: "32px",
                fontWeight: 800,
                color: "white",
                letterSpacing: "6px",
                margin: 0,
                fontFamily: "monospace",
              }}
            >
              {currentWs.inviteCode}
            </p>
          </div>
          <button
            onClick={copyInviteCode}
            style={{
              ...primaryBtn(copiedCode ? "#22c55e" : theme.primary, false),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            {copiedCode ? <Check size={16} /> : <Copy size={16} />}
            {copiedCode
              ? ru ? "Скопировано!" : "Copied!"
              : ru ? "Копировать код" : "Copy Code"}
          </button>
        </div>

        <div style={{ ...sectionCard, marginTop: "12px" }}>
          <p style={sectionTitle}>{ru ? "Текущие участники" : "Current Members"}</p>
          {members.map((m) => (
            <div key={m.uid} style={{ ...memberRow, marginBottom: "8px" }}>
              <div style={avatar(theme.primary)}>
                {m.displayName.charAt(0).toUpperCase()}
              </div>
              <p style={{ fontSize: "14px", color: "white", margin: 0, flex: 1 }}>
                {m.displayName}
              </p>
              <RoleBadge role={m.role} ru={ru} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Вид: Статистика ───────────────────────────────────────────────────
  if (view === "stats" && currentWs) {
    const completion =
      stats && stats.totalTasks > 0
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0;

    const memberStats = members.map((m) => {
      const assigned = tasks.filter((t) => t.assigneeId === m.uid);
      const done = assigned.filter((t) => t.completed);
      return { ...m, assigned: assigned.length, done: done.length };
    });

    return (
      <div>
        <BackHeader
          title={ru ? "Статистика команды" : "Team Stats"}
          onBack={() => setView("workspace")}
        />

        {/* Общие показатели */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          {[
            { icon: CheckSquare, label: ru ? "Задач" : "Tasks",       value: stats?.totalTasks ?? 0,     color: theme.primary },
            { icon: Check,       label: ru ? "Готово" : "Done",       value: stats?.completedTasks ?? 0, color: "#22c55e"     },
            { icon: Users,       label: ru ? "Участников" : "Members",value: stats?.memberCount ?? 0,    color: "#6366f1"     },
            { icon: BarChart2,   label: ru ? "%" : "%",               value: completion + "%",            color: "#f59e0b"     },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} style={statCard(color)}>
              <Icon size={18} color={color} />
              <p style={{ fontSize: "24px", fontWeight: 800, color: "white", margin: "6px 0 2px" }}>
                {value}
              </p>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", margin: 0 }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Прогресс-бар */}
        <div style={{ ...sectionCard, marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <p style={sectionTitle}>{ru ? "Прогресс" : "Progress"}</p>
            <p style={{ fontSize: "13px", color: theme.primary, fontWeight: 600, margin: 0 }}>
              {completion}%
            </p>
          </div>
          <div style={{ height: "8px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "4px" }}>
            <div
              style={{
                height: "100%",
                width: `${completion}%`,
                backgroundColor: theme.primary,
                borderRadius: "4px",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>

        {/* По участникам */}
        <div style={sectionCard}>
          <p style={sectionTitle}>{ru ? "По участникам" : "By Member"}</p>
          {memberStats.map((m) => (
            <div key={m.uid} style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <p style={{ fontSize: "13px", color: "white", margin: 0 }}>{m.displayName}</p>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                  {m.done}/{m.assigned} {ru ? "задач" : "tasks"}
                </p>
              </div>
              <div style={{ height: "5px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "3px" }}>
                <div
                  style={{
                    height: "100%",
                    width: m.assigned > 0 ? `${Math.round((m.done / m.assigned) * 100)}%` : "0%",
                    backgroundColor: theme.primary,
                    borderRadius: "3px",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Вспомогательные компоненты ───────────────────────────────────────────

function BackHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.5)",
            fontSize: "13px",
            padding: 0,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          ←
        </button>
        <p style={{ fontSize: "18px", fontWeight: 700, color: "white", margin: 0 }}>
          {title}
        </p>
      </div>
      {right}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div
      style={{
        backgroundColor: "rgba(239,68,68,0.12)",
        border: "1px solid rgba(239,68,68,0.25)",
        borderRadius: "10px",
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      <AlertCircle size={14} color="#ef4444" />
      <p style={{ fontSize: "13px", color: "#ef4444", margin: 0 }}>{text}</p>
    </div>
  );
}

// ─── Стили (константы) ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px",
  padding: "11px 13px",
  color: "white",
  fontSize: "15px",
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "rgba(255,255,255,0.45)",
  display: "block",
  marginBottom: "6px",
};

const primaryBtn = (
  color: string,
  disabled: boolean
): React.CSSProperties => ({
  width: "100%",
  padding: "13px",
  borderRadius: "13px",
  border: "none",
  backgroundColor: disabled ? "rgba(255,255,255,0.1)" : color,
  color: "white",
  fontSize: "15px",
  fontWeight: 600,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  transition: "opacity 0.2s",
});

const btnStyleSmall: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  padding: "7px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.07)",
  color: "white",
  fontSize: "13px",
  cursor: "pointer",
};

const wsCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "13px 14px",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.07)",
  backgroundColor: "rgba(255,255,255,0.05)",
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
};

const sectionCard: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.04)",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.07)",
  padding: "14px",
  marginBottom: "0",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "rgba(255,255,255,0.6)",
  margin: "0 0 10px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const memberRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const taskCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "11px 13px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.07)",
  backgroundColor: "rgba(255,255,255,0.04)",
};

const emptyBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "40px 20px",
  backgroundColor: "rgba(255,255,255,0.03)",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.06)",
};

const iconBtn: React.CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "rgba(255,255,255,0.05)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const roleSelect: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  padding: "4px 8px",
  color: "white",
  fontSize: "12px",
  cursor: "pointer",
  outline: "none",
};

const avatar = (color: string): React.CSSProperties => ({
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  backgroundColor: `${color}30`,
  border: `1px solid ${color}50`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "14px",
  fontWeight: 700,
  color: color,
  flexShrink: 0,
});

const statCard = (color: string): React.CSSProperties => ({
  backgroundColor: `${color}10`,
  border: `1px solid ${color}25`,
  borderRadius: "14px",
  padding: "14px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
});
