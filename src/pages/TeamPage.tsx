import { useState, useEffect, useMemo } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import {
  useTeamStore, Role, TeamTask,
  canCreateTasks, canManageMembers, canDeleteWorkspace,
  getSafeUserId,
} from "@/lib/teamStore";
import { getTelegramUserId } from "@/lib/store";
import {
  parseStartParam, triggerHaptic, tgConfirm, getTelegramUser,
  copyInviteCode, copyInviteLink, shareInviteToTelegram,
  buildInviteLink,
} from "@/lib/telegram";
import MemberAvatar from "@/components/MemberAvatar";
import { getAccentGradient } from "@/lib/theme";
import {
  Plus, Users, Copy, Check, Crown, Shield, User as UserIcon,
  Trash2, BarChart2, CheckSquare, UserPlus, X, ChevronRight,
  AlertCircle, Send, Link2, LogOut, Calendar, Clock, Settings,
  Eye, Edit3, MessageSquare, QrCode, ChevronDown,
} from "lucide-react";

// ─── Типы ────────────────────────────────────────────────────────
type View = "list" | "create" | "join" | "workspace" | "tasks" | "invite" | "stats" | "members";
type TaskFilter = "all" | "my" | "open" | "done" | "overdue";

// ─── Компоненты ──────────────────────────────────────────────────
function RoleBadge({ role, ru }: { role: Role; ru: boolean }) {
  const cfg: Record<Role, { color: string; label: string; icon: any }> = {
    owner:  { color: "#f59e0b", label: ru ? "Владелец" : "Owner",   icon: Crown  },
    admin:  { color: "#6366f1", label: ru ? "Админ"    : "Admin",   icon: Shield },
    member: { color: "#22c55e", label: ru ? "Участник" : "Member",  icon: UserIcon },
    viewer: { color: "#94a3b8", label: ru ? "Читатель" : "Viewer",  icon: Eye    },
  };
  const { color, label, icon: Icon } = cfg[role] || cfg.member;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4,
      background: `${color}20`, borderRadius: 6, padding: "3px 7px" }}>
      <Icon size={10} color={color} />
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function formatDeadline(iso: string | null | undefined, ru: boolean) {
  if (!iso) return { text: "", color: "rgba(255,255,255,0.4)", urgent: false };
  const date = new Date(iso), now = new Date();
  const ms = date.getTime() - now.getTime();
  const hrs = ms / 3600000, days = hrs / 24;
  if (ms < 0)    return { text: ru ? "Просрочено" : "Overdue", color: "#ef4444", urgent: true };
  if (hrs < 1)   return { text: ru ? `${Math.round(ms/60000)} мин` : `${Math.round(ms/60000)}m`, color: "#ef4444", urgent: true };
  if (hrs < 24)  return { text: ru ? `${Math.round(hrs)} ч` : `${Math.round(hrs)}h`, color: "#f59e0b", urgent: true };
  if (days < 7)  return { text: ru ? `${Math.round(days)} дн` : `${Math.round(days)}d`, color: "#fbbf24", urgent: false };
  return { text: date.toLocaleDateString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "short" }), color: "rgba(255,255,255,0.4)", urgent: false };
}

// ─── Стили ───────────────────────────────────────────────────────
const S = {
  pageTitle: { fontSize: 22, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.5px" } as const,
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 } as const,
  lbl: { display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "0.6px", marginBottom: 6 },
  inp: { display: "block", width: "100%", height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 14px", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const },
  card: { background: "rgba(255,255,255,0.04)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" as const, letterSpacing: "0.6px", margin: "0 0 12px" },
  memberRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  taskCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "10px 12px", display: "flex", alignItems: "flex-start", gap: 10 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const,
  emptyBox: { background: "rgba(255,255,255,0.03)", borderRadius: 18, padding: "32px 20px", textAlign: "center" as const, border: "1px dashed rgba(255,255,255,0.08)", display: "flex", flexDirection: "column" as const, alignItems: "center" },
  roleSel: { height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 8px", fontSize: 12, outline: "none", fontFamily: "inherit", cursor: "pointer" } as const,
  dangerBtn: { width: "100%", height: 44, borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" } as const,
  secondaryBtn: { flex: 1, height: 42, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" } as const,
};

function primaryBtn(color: string, disabled = false) {
  return { width: "100%", height: 46, borderRadius: 14, border: "none", background: disabled ? "rgba(255,255,255,0.1)" : color, color: "#fff", fontSize: 14, fontWeight: 700, cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit", opacity: disabled ? 0.6 : 1 } as const;
}

function smallBtn(color: string) {
  return { height: 34, padding: "0 14px", borderRadius: 10, border: `1px solid ${color}50`, background: `${color}12`, color, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" } as const;
}

function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <button onClick={onBack} style={{ ...S.iconBtn, background: "rgba(255,255,255,0.08)" }}>
        <ChevronRight size={16} color="rgba(255,255,255,0.6)" style={{ transform: "rotate(180deg)" }} />
      </button>
      <p style={{ ...S.pageTitle, fontSize: 18, flex: 1 }}>{title}</p>
      {right}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
      <AlertCircle size={14} color="#fca5a5" />
      <p style={{ fontSize: 13, color: "#fca5a5", margin: 0 }}>{text}</p>
    </div>
  );
}

// ─── Главный компонент ───────────────────────────────────────────
export default function TeamPage() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const gradient = getAccentGradient(theme);

  const _rawUid = getTelegramUserId();
  const uid     = getSafeUserId(_rawUid);
  const tgUser  = getTelegramUser();
  const userName    = tgUser?.first_name || tgUser?.username || `User${uid.slice(-4)}`;
  const userPhotoUrl = tgUser?.photo_url || "";

  const {
    workspaces, currentWsId, members, tasks, loading,
    subscribeWorkspaces, selectWorkspace,
    createWorkspace, joinByCode,
    leaveWorkspace, deleteWorkspace,
    changeRole, removeMember,
    createTask, toggleTask, deleteTask, updateTask,
  } = useTeamStore();

  const [view,       setView]       = useState<View>("list");
  const [error,      setError]      = useState("");
  const [copiedKind, setCopiedKind] = useState<"code" | "link" | null>(null);
  const [newName,    setNewName]    = useState("");
  const [newDesc,    setNewDesc]    = useState("");
  const [joinCode,   setJoinCode]   = useState("");

  // Форма задачи
  const [taskTitle,    setTaskTitle]    = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskDueDate,  setTaskDueDate]  = useState("");
  const [taskDueTime,  setTaskDueTime]  = useState("");
  const [taskNote,     setTaskNote]     = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask,  setEditingTask]  = useState<TeamTask | null>(null);

  // Фильтр задач
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

  // Управление участником
  const [managingMember, setManagingMember] = useState<string | null>(null);

  useEffect(() => {
    if (uid) subscribeWorkspaces(uid);
  }, [uid]); // eslint-disable-line

  // Обработка invite link при открытии
  useEffect(() => {
    if (!uid) return;
    const param = parseStartParam();
    if (param?.type === "join") {
      setJoinCode(param.code);
      setView("join");
    }
  }, [uid]); // eslint-disable-line

  const currentWs = workspaces.find((w) => w.id === currentWsId);
  const myMember  = members.find((m) => m.uid === uid);
  const myRole: Role = myMember?.role || "member";

  const canCreate  = canCreateTasks(myRole);
  const canManage  = canManageMembers(myRole);
  const isOwner    = myRole === "owner";

  // Фильтрованные задачи
  const filteredTasks = useMemo(() => {
    const now = new Date();
    let list  = [...tasks];
    switch (taskFilter) {
      case "my":      list = list.filter((t) => t.assigneeId === uid); break;
      case "open":    list = list.filter((t) => !t.completed); break;
      case "done":    list = list.filter((t) => t.completed); break;
      case "overdue": list = list.filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) < now); break;
    }
    return list.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [tasks, taskFilter, uid]);

  const taskCounts = useMemo(() => {
    const now = new Date();
    return {
      all:     tasks.length,
      my:      tasks.filter((t) => t.assigneeId === uid).length,
      open:    tasks.filter((t) => !t.completed).length,
      done:    tasks.filter((t) => t.completed).length,
      overdue: tasks.filter((t) => !t.completed && t.dueDate && new Date(t.dueDate) < now).length,
    };
  }, [tasks, uid]);

  // ─── Handlers ────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newName.trim() || !uid) return;
    setError("");
    try {
      const wsId = await createWorkspace(newName, newDesc, uid, userName, userPhotoUrl);
      setNewName(""); setNewDesc("");
      selectWorkspace(wsId);
      setView("workspace");
      triggerHaptic("success");
    } catch (e: any) { setError(e.message || "Error"); triggerHaptic("error"); }
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || !uid) return;
    setError("");
    try {
      const wsId = await joinByCode(joinCode, uid, userName, tgUser?.username, userPhotoUrl);
      setJoinCode("");
      selectWorkspace(wsId);
      setView("workspace");
      triggerHaptic("success");
    } catch (e: any) {
      const code = e.message;
      if (code === "CODE_NOT_FOUND")  setError(ru ? "Код не найден. Проверь правильность." : "Code not found. Check it's correct.");
      else if (code === "ALREADY_MEMBER") setError(ru ? "Ты уже в этом пространстве" : "Already a member");
      else if (code === "INVALID_PARAMS") setError(ru ? "Неверный код" : "Invalid code");
      else setError(ru ? `Ошибка: ${code}` : `Error: ${code}`);
      triggerHaptic("error");
    }
  };

  const handleLeave = async () => {
    if (!currentWs || !uid) return;
    const ok = await tgConfirm(ru ? `Покинуть «${currentWs.name}»?` : `Leave "${currentWs.name}"?`);
    if (!ok) return;
    await leaveWorkspace(currentWs.id, uid);
    selectWorkspace(null);
    setView("list");
    triggerHaptic("success");
  };

  const handleDeleteWs = async () => {
    if (!currentWs) return;
    const ok = await tgConfirm(ru ? `Удалить «${currentWs.name}»? Все задачи будут удалены.` : `Delete "${currentWs.name}"? All tasks will be removed.`);
    if (!ok) return;
    await deleteWorkspace(currentWs.id);
    selectWorkspace(null);
    setView("list");
    triggerHaptic("success");
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !currentWs || !uid) return;
    const assignee = members.find((m) => m.uid === taskAssignee);
    let dueDate: string | null = null;
    if (taskDueDate) {
      const iso = taskDueTime ? `${taskDueDate}T${taskDueTime}:00` : `${taskDueDate}T23:59:00`;
      const d   = new Date(iso);
      if (!isNaN(d.getTime())) dueDate = d.toISOString();
    }

    if (editingTask) {
      // Редактируем существующую
      await updateTask(currentWs.id, editingTask.id, {
        title: taskTitle.trim(),
        assigneeId:   taskAssignee || null,
        assigneeName: assignee?.displayName || null,
        priority: taskPriority,
        dueDate,
        note: taskNote || undefined,
      });
      setEditingTask(null);
    } else {
      await createTask(currentWs.id, {
        title: taskTitle.trim(),
        assigneeId:   taskAssignee || null,
        assigneeName: assignee?.displayName || null,
        createdBy:     uid,
        createdByName: userName,
        priority: taskPriority,
        dueDate,
        note: taskNote || undefined,
      });
    }

    setTaskTitle(""); setTaskAssignee(""); setTaskPriority("medium");
    setTaskDueDate(""); setTaskDueTime(""); setTaskNote("");
    setShowTaskForm(false);
    triggerHaptic("success");
  };

  const startEditTask = (task: TeamTask) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskAssignee(task.assigneeId || "");
    setTaskPriority(task.priority);
    setTaskNote(task.note || "");
    if (task.dueDate) {
      const d = new Date(task.dueDate);
      setTaskDueDate(d.toISOString().split("T")[0]);
      setTaskDueTime(d.toTimeString().slice(0, 5));
    } else { setTaskDueDate(""); setTaskDueTime(""); }
    setShowTaskForm(true);
  };

  const handleCopyCode = async () => {
    if (!currentWs) return;
    await copyInviteCode(currentWs.inviteCode);
    setCopiedKind("code"); setTimeout(() => setCopiedKind(null), 2000);
  };

  const handleCopyLink = async () => {
    if (!currentWs) return;
    await copyInviteLink(currentWs.inviteCode);
    setCopiedKind("link"); setTimeout(() => setCopiedKind(null), 2000);
  };

  const handleShare = () => {
    if (!currentWs) return;
    shareInviteToTelegram(currentWs.inviteCode, currentWs.name, ru);
    triggerHaptic("light");
  };

  // ─── VIEWS ───────────────────────────────────────────────────

  // ═══ СПИСОК ══════════════════════════════════════════════════
  if (view === "list") {
    return (
      <div style={{ paddingTop: 4 }}>
        <div style={S.headerRow}>
          <p style={S.pageTitle}>{ru ? "Команды" : "Teams"}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setError(""); setView("join"); }} style={smallBtn("#6366f1")}>
              <UserPlus size={13} />{ru ? "Вступить" : "Join"}
            </button>
            <button onClick={() => { setError(""); setView("create"); }} style={smallBtn(theme.primary)}>
              <Plus size={13} />{ru ? "Создать" : "Create"}
            </button>
          </div>
        </div>

        {workspaces.length === 0 ? (
          <div style={S.emptyBox}>
            <Users size={40} color="rgba(255,255,255,0.2)" />
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: "14px 0 0", lineHeight: 1.6, textAlign: "center" }}>
              {ru ? "Нет командных пространств.\nСоздай или вступи по коду." : "No team workspaces.\nCreate one or join with a code."}
            </p>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: "12px 0 0", textAlign: "center" }}>
              {ru ? "💡 Попроси коллегу поделиться ссылкой или кодом" : "💡 Ask a colleague to share the link or code"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workspaces.map((ws) => (
              <button key={ws.id}
                onClick={() => { selectWorkspace(ws.id); setView("workspace"); triggerHaptic("light"); }}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit" }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `${theme.primary}18`, border: `1px solid ${theme.primary}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                  {ws.emoji || "👥"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 2px" }}>{ws.name}</p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>
                    {ws.memberIds.length} {ru ? "участников" : "members"}
                    {ws.description ? ` · ${ws.description}` : ""}
                  </p>
                </div>
                {ws.ownerId === uid && <Crown size={14} color="#f59e0b" />}
                <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ═══ СОЗДАТЬ ═════════════════════════════════════════════════
  if (view === "create") {
    return (
      <div>
        <BackHeader title={ru ? "Новое пространство" : "New Workspace"} onBack={() => setView("list")} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.lbl}>{ru ? "Название *" : "Name *"}</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder={ru ? "Команда Альфа" : "Team Alpha"} maxLength={50} style={S.inp} autoFocus />
          </div>
          <div>
            <label style={S.lbl}>{ru ? "Описание" : "Description"}</label>
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              placeholder={ru ? "Кратко о команде..." : "Short description..."} maxLength={100} style={S.inp} />
          </div>
          {error && <ErrorBox text={error} />}
          <button onClick={handleCreate} disabled={!newName.trim() || loading} style={primaryBtn(theme.primary, !newName.trim() || loading)}>
            {loading ? (ru ? "Создаём..." : "Creating...") : (ru ? "Создать команду" : "Create team")}
          </button>
        </div>
      </div>
    );
  }

  // ═══ ВСТУПИТЬ ════════════════════════════════════════════════
  if (view === "join") {
    return (
      <div>
        <BackHeader title={ru ? "Вступить в команду" : "Join Team"} onBack={() => { setError(""); setView("list"); }} />
        <div style={{ ...S.card, marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 12px", lineHeight: 1.6 }}>
            {ru
              ? "Введи 8-значный код приглашения, который тебе дал владелец команды, или перейди по ссылке-приглашению."
              : "Enter the 8-character invite code from the team owner, or open the invite link."}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={S.lbl}>{ru ? "Код приглашения" : "Invite Code"}</label>
            <input
              value={joinCode}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                setJoinCode(v);
                if (error) setError("");
              }}
              placeholder="XXXXXXXX"
              maxLength={8}
              style={{ ...S.inp, letterSpacing: 8, fontWeight: 800, fontSize: 22, textAlign: "center", fontFamily: "monospace" }}
            />
          </div>
          {error && <ErrorBox text={error} />}
          <button onClick={handleJoin} disabled={joinCode.length !== 8 || loading} style={primaryBtn(theme.primary, joinCode.length !== 8 || loading)}>
            {loading ? (ru ? "Ищем команду..." : "Searching...") : (ru ? "Вступить" : "Join")}
          </button>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", margin: 0 }}>
            {ru ? "Или попроси владельца поделиться ссылкой через Telegram" : "Or ask the owner to share a Telegram invite link"}
          </p>
        </div>
      </div>
    );
  }

  // ═══ ПРОСТРАНСТВО ════════════════════════════════════════════
  if (view === "workspace" && currentWs) {
    const activeTasks = tasks.filter((t) => !t.completed).length;

    return (
      <div>
        <BackHeader title={currentWs.name} onBack={() => { selectWorkspace(null); setView("list"); }}
          right={<RoleBadge role={myRole} ru={ru} />} />

        {currentWs.description && (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 16px", lineHeight: 1.5 }}>
            {currentWs.description}
          </p>
        )}

        {/* Моя роль */}
        {myRole === "viewer" && (
          <div style={{ background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", gap: 8, alignItems: "center" }}>
            <Eye size={14} color="#94a3b8" />
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
              {ru ? "Ты в режиме просмотра — только смотришь задачи" : "You're a viewer — read-only access"}
            </p>
          </div>
        )}

        {/* Навигационные карточки */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { id: "tasks"  as View, icon: CheckSquare, label: ru ? "Задачи"   : "Tasks",   color: "#22c55e", count: activeTasks },
            { id: "members" as View, icon: Users,      label: ru ? "Участники": "Members", color: theme.primary, count: members.length },
            { id: "invite" as View, icon: UserPlus,    label: ru ? "Инвайт"   : "Invite",  color: "#6366f1" },
          ].map(({ id, icon: Icon, label, color, count }) => (
            <button key={id} onClick={() => { setView(id); triggerHaptic("light"); }}
              style={{ background: `${color}10`, border: `1px solid ${color}20`, borderRadius: 16, padding: "14px 8px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
              <div style={{ position: "relative" }}>
                <Icon size={22} color={color} />
                {count !== undefined && count > 0 && (
                  <div style={{ position: "absolute", top: -6, right: -8, minWidth: 16, height: 16, borderRadius: 8, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{count}</div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "#fff", fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Быстрый список участников */}
        <div style={S.card}>
          <p style={S.cardTitle}>{ru ? `Команда (${members.length})` : `Team (${members.length})`}</p>
          {members.slice(0, 4).map((m) => (
            <div key={m.uid} style={S.memberRow}>
              <MemberAvatar displayName={m.displayName} photoUrl={m.photoUrl} size={32} color={theme.primary} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#fff", margin: 0 }}>
                  {m.displayName}{m.uid === uid && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginLeft: 5 }}>({ru ? "ты" : "you"})</span>}
                </p>
              </div>
              <RoleBadge role={m.role} ru={ru} />
            </div>
          ))}
          {members.length > 4 && (
            <button onClick={() => setView("members")} style={{ background: "none", border: "none", color: theme.primary, fontSize: 12, cursor: "pointer", marginTop: 8, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
              <ChevronDown size={14} />{ru ? `Ещё ${members.length - 4}` : `${members.length - 4} more`}
            </button>
          )}
        </div>

        {/* Действия */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {!isOwner && (
            <button onClick={handleLeave} style={S.dangerBtn}>
              <LogOut size={14} />{ru ? "Покинуть пространство" : "Leave Workspace"}
            </button>
          )}
          {isOwner && (
            <button onClick={handleDeleteWs} style={S.dangerBtn}>
              <Trash2 size={14} />{ru ? "Удалить пространство" : "Delete Workspace"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══ УЧАСТНИКИ ════════════════════════════════════════════════
  if (view === "members" && currentWs) {
    return (
      <div>
        <BackHeader title={ru ? `Участники (${members.length})` : `Members (${members.length})`} onBack={() => setView("workspace")} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m) => {
            const isMe      = m.uid === uid;
            const showManage = managingMember === m.uid;

            return (
              <div key={m.uid} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
                {/* Строка участника */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                  <MemberAvatar displayName={m.displayName} photoUrl={m.photoUrl} size={40} color={theme.primary} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: "0 0 2px" }}>
                      {m.displayName}{isMe && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginLeft: 5 }}>({ru ? "ты" : "you"})</span>}
                    </p>
                    {m.username && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>@{m.username}</p>}
                    <div style={{ marginTop: 4 }}><RoleBadge role={m.role} ru={ru} /></div>
                  </div>

                  {/* Кнопка управления (только для owner/admin) */}
                  {canManage && !isMe && m.role !== "owner" && (
                    <button
                      onClick={() => setManagingMember(showManage ? null : m.uid)}
                      style={{ ...S.iconBtn, background: showManage ? `${theme.primary}20` : "rgba(255,255,255,0.06)", border: showManage ? `1px solid ${theme.primary}40` : "none" }}
                    >
                      <Settings size={14} color={showManage ? theme.primary : "rgba(255,255,255,0.5)"} />
                    </button>
                  )}
                </div>

                {/* Панель управления участником */}
                {showManage && canManage && !isMe && m.role !== "owner" && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px", background: "rgba(255,255,255,0.02)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.6px", margin: 0 }}>
                      {ru ? "Управление участником" : "Manage member"}
                    </p>

                    {/* Выбор роли */}
                    <div>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 8px" }}>{ru ? "Роль:" : "Role:"}</p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(["member", "admin", "viewer"] as Role[]).map((r) => {
                          const roleLabels: Record<string, { ru: string; en: string; icon: any; color: string }> = {
                            owner:  { ru: "Владелец", en: "Owner",  icon: Crown,   color: "#f59e0b" },
                            admin:  { ru: "Админ",    en: "Admin",  icon: Shield,  color: "#6366f1" },
                            member: { ru: "Участник", en: "Member", icon: UserIcon, color: "#22c55e" },
                            viewer: { ru: "Читатель", en: "Viewer", icon: Eye,     color: "#94a3b8" },
                          };
                          const rl = roleLabels[r];
                          const Icon = rl.icon;
                          const isActive = m.role === r;
                          return (
                            <button key={r} onClick={() => { changeRole(currentWs.id, m.uid, r, userName); }}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1px solid ${isActive ? rl.color : "rgba(255,255,255,0.1)"}`, background: isActive ? `${rl.color}20` : "rgba(255,255,255,0.04)", color: isActive ? rl.color : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: isActive ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                              <Icon size={11} />{ru ? rl.ru : rl.en}
                            </button>
                          );
                        })}
                      </div>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: "8px 0 0", lineHeight: 1.5 }}>
                        {m.role === "viewer" && (ru ? "👁 Только просматривает задачи" : "👁 Can only view tasks")}
                        {m.role === "member" && (ru ? "✏️ Может создавать и выполнять задачи" : "✏️ Can create and complete tasks")}
                        {m.role === "admin" && (ru ? "🛡 Может управлять участниками и задачами" : "🛡 Can manage members and tasks")}
                      </p>
                    </div>

                    {/* Удалить участника */}
                    {isOwner && (
                      <button onClick={async () => {
                        const ok = await tgConfirm(ru ? `Удалить ${m.displayName} из команды?` : `Remove ${m.displayName} from team?`);
                        if (ok) { await removeMember(currentWs.id, m.uid); setManagingMember(null); }
                      }} style={{ ...S.dangerBtn, height: 36, fontSize: 12 }}>
                        <X size={13} />{ru ? "Удалить из команды" : "Remove from team"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══ ЗАДАЧИ ══════════════════════════════════════════════════
  if (view === "tasks" && currentWs) {
    const pColors = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
    const filters: { id: TaskFilter; label: string; emoji: string }[] = [
      { id: "all",     label: ru ? "Все"      : "All",     emoji: "📋" },
      { id: "my",      label: ru ? "Мои"      : "Mine",    emoji: "👤" },
      { id: "open",    label: ru ? "Открытые" : "Open",    emoji: "🔄" },
      { id: "overdue", label: ru ? "Просроч." : "Overdue", emoji: "⚠️" },
      { id: "done",    label: ru ? "Готово"   : "Done",    emoji: "✅" },
    ];

    return (
      <div>
        <BackHeader title={ru ? "Задачи команды" : "Team Tasks"} onBack={() => setView("workspace")}
          right={<RoleBadge role={myRole} ru={ru} />} />

        {/* Фильтры */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
          {filters.map((f) => {
            const isActive = taskFilter === f.id;
            return (
              <button key={f.id} onClick={() => setTaskFilter(f.id)}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 20, border: `1px solid ${isActive ? theme.primary : "rgba(255,255,255,0.1)"}`, background: isActive ? `${theme.primary}20` : "rgba(255,255,255,0.05)", color: isActive ? theme.primary : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: isActive ? 700 : 400, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" }}>
                <span>{f.emoji}</span><span>{f.label}</span>
                <span style={{ fontSize: 11, background: isActive ? `${theme.primary}30` : "rgba(255,255,255,0.1)", borderRadius: 8, padding: "1px 6px", fontWeight: 700 }}>{taskCounts[f.id]}</span>
              </button>
            );
          })}
        </div>

        {/* Форма задачи */}
        {canCreate && (
          <>
            {!showTaskForm ? (
              <button onClick={() => { setShowTaskForm(true); setEditingTask(null); triggerHaptic("light"); }}
                style={{ width: "100%", padding: 12, borderRadius: 14, border: `1px dashed ${theme.primary}50`, background: `${theme.primary}08`, color: theme.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                <Plus size={16} />{ru ? "Добавить задачу" : "Add task"}
              </button>
            ) : (
              <div style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>
                    {editingTask ? (ru ? "Редактировать" : "Edit task") : (ru ? "Новая задача" : "New task")}
                  </p>
                  <button onClick={() => { setShowTaskForm(false); setEditingTask(null); }} style={S.iconBtn}>
                    <X size={13} color="rgba(255,255,255,0.5)" />
                  </button>
                </div>

                <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={ru ? "Название задачи..." : "Task title..."} autoFocus
                  style={{ ...S.inp, marginBottom: 10 }} onKeyDown={(e) => e.key === "Enter" && handleCreateTask()} />

                {/* Назначить */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...S.lbl, marginBottom: 4 }}>{ru ? "Назначить" : "Assign to"}</label>
                    <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}
                      style={{ ...S.roleSel, width: "100%", height: 38, fontSize: 13, padding: "0 10px" }}>
                      <option value="">{ru ? "— Никому —" : "— Unassigned —"}</option>
                      {members.filter((m) => canCreateTasks(m.role)).map((m) => (
                        <option key={m.uid} value={m.uid}>{m.displayName}{m.uid === uid ? ` (${ru ? "я" : "me"})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...S.lbl, marginBottom: 4 }}>{ru ? "Приоритет" : "Priority"}</label>
                    <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as any)}
                      style={{ ...S.roleSel, height: 38, fontSize: 13, padding: "0 8px" }}>
                      <option value="low">🟢 {ru ? "Низкий" : "Low"}</option>
                      <option value="medium">🟡 {ru ? "Средний" : "Med"}</option>
                      <option value="high">🔴 {ru ? "Высокий" : "High"}</option>
                    </select>
                  </div>
                </div>

                {/* Дата */}
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)}
                    style={{ ...S.inp, flex: 1, height: 38, fontSize: 13, colorScheme: "dark" }} />
                  <input type="time" value={taskDueTime} onChange={(e) => setTaskDueTime(e.target.value)}
                    disabled={!taskDueDate}
                    style={{ ...S.inp, width: 110, height: 38, fontSize: 13, colorScheme: "dark", opacity: taskDueDate ? 1 : 0.4 }} />
                </div>

                {/* Заметка исполнителю */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ ...S.lbl, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <MessageSquare size={10} />{ru ? "Заметка исполнителю" : "Note to assignee"}
                  </label>
                  <textarea value={taskNote} onChange={(e) => setTaskNote(e.target.value)}
                    placeholder={ru ? "Дополнительный контекст..." : "Additional context..."}
                    rows={2}
                    style={{ ...S.inp, height: "auto", padding: "10px 14px", resize: "none", lineHeight: 1.4 }} />
                </div>

                <button onClick={handleCreateTask} disabled={!taskTitle.trim()} style={primaryBtn(theme.primary, !taskTitle.trim())}>
                  <Plus size={15} />
                  {editingTask ? (ru ? "Сохранить" : "Save") : (ru ? "Создать задачу" : "Create task")}
                </button>
              </div>
            )}
          </>
        )}

        {/* Список задач */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredTasks.length === 0 ? (
            <div style={S.emptyBox}>
              <CheckSquare size={32} color="rgba(255,255,255,0.2)" />
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 10 }}>
                {ru ? "Нет задач в этой категории" : "No tasks here"}
              </p>
            </div>
          ) : filteredTasks.map((task) => {
            const assignee  = members.find((m) => m.uid === task.assigneeId);
            const deadline  = formatDeadline(task.dueDate, ru);
            const canEdit   = canManage || task.createdBy === uid;
            // viewer не может выполнять задачи, но может видеть
            const canToggle = canCreate;

            return (
              <div key={task.id} style={{
                ...S.taskCard,
                borderLeft: deadline.urgent && !task.completed ? `3px solid ${deadline.color}` : "1px solid rgba(255,255,255,0.08)",
                opacity: task.completed ? 0.6 : 1,
              }}>
                {/* Чекбокс */}
                <button
                  onClick={() => canToggle && toggleTask(currentWs.id, task.id, !task.completed, userName)}
                  style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${task.completed ? theme.primary : "rgba(255,255,255,0.2)"}`, background: task.completed ? theme.primary : "transparent", cursor: canToggle ? "pointer" : "default", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, marginTop: 1 }}
                  title={canToggle ? "" : (ru ? "Нет прав" : "No permission")}
                >
                  {task.completed && <Check size={13} color="white" />}
                </button>

                {/* Контент */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, color: task.completed ? "rgba(255,255,255,0.35)" : "#fff", margin: 0, textDecoration: task.completed ? "line-through" : "none", fontWeight: 500 }}>
                    {task.title}
                  </p>

                  {/* Заметка */}
                  {task.note && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: "3px 0 0", fontStyle: "italic", lineHeight: 1.4 }}>
                      💬 {task.note}
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                    {/* Исполнитель */}
                    {assignee ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <MemberAvatar displayName={assignee.displayName} photoUrl={assignee.photoUrl} size={14} color={theme.primary} />
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                          {assignee.displayName}{assignee.uid === uid && ` (${ru ? "ты" : "you"})`}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{ru ? "не назначено" : "unassigned"}</span>
                    )}

                    {/* Дедлайн */}
                    {deadline.text && (
                      <span style={{ fontSize: 10, color: deadline.color, background: `${deadline.color}15`, padding: "1px 6px", borderRadius: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                        <Clock size={9} />{deadline.text}
                      </span>
                    )}

                    {/* Создатель */}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                      {ru ? "от" : "by"} {task.createdByName}
                    </span>
                  </div>
                </div>

                {/* Приоритет + кнопки */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: pColors[task.priority] }} />
                  <div style={{ display: "flex", gap: 4 }}>
                    {canEdit && (
                      <button onClick={() => startEditTask(task)} style={S.iconBtn} title={ru ? "Редактировать" : "Edit"}>
                        <Edit3 size={11} color="rgba(255,255,255,0.4)" />
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => deleteTask(currentWs.id, task.id)} style={{ ...S.iconBtn, background: "rgba(239,68,68,0.08)" }} title={ru ? "Удалить" : "Delete"}>
                        <Trash2 size={11} color="rgba(239,68,68,0.5)" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Подсказка для viewer */}
        {!canCreate && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>
              {ru ? "👁 Режим просмотра — попроси владельца изменить твою роль" : "👁 View-only — ask the owner to change your role"}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ═══ ИНВАЙТ ══════════════════════════════════════════════════
  if (view === "invite" && currentWs) {
    const inviteLink = buildInviteLink(currentWs.inviteCode);

    return (
      <div>
        <BackHeader title={ru ? "Пригласить" : "Invite"} onBack={() => setView("workspace")} />

        <div style={S.card}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 14px", lineHeight: 1.6 }}>
            {ru ? "Поделись кодом или ссылкой — участник сразу вступит в команду." : "Share the code or link — member joins instantly."}
          </p>

          {/* Большой код */}
          <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", padding: "20px 16px", textAlign: "center", marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>{ru ? "Код" : "Code"}</p>
            <p style={{ fontSize: 36, fontWeight: 800, color: "#fff", letterSpacing: 8, margin: 0, fontFamily: "monospace" }}>
              {currentWs.inviteCode}
            </p>
          </div>

          {/* Ссылка */}
          <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={13} color="rgba(255,255,255,0.4)" />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {inviteLink}
            </p>
          </div>

          {/* Кнопки */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={handleShare} style={primaryBtn(theme.primary)}>
              <Send size={16} />{ru ? "Поделиться в Telegram" : "Share to Telegram"}
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCopyLink}
                style={{ ...S.secondaryBtn, background: copiedKind === "link" ? "#22c55e25" : "rgba(255,255,255,0.06)", borderColor: copiedKind === "link" ? "#22c55e40" : "rgba(255,255,255,0.12)" }}>
                {copiedKind === "link" ? <Check size={14} color="#22c55e" /> : <Link2 size={14} />}
                {copiedKind === "link" ? (ru ? "Скопировано!" : "Copied!") : (ru ? "Ссылка" : "Link")}
              </button>
              <button onClick={handleCopyCode}
                style={{ ...S.secondaryBtn, background: copiedKind === "code" ? "#22c55e25" : "rgba(255,255,255,0.06)", borderColor: copiedKind === "code" ? "#22c55e40" : "rgba(255,255,255,0.12)" }}>
                {copiedKind === "code" ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                {copiedKind === "code" ? (ru ? "Скопировано!" : "Copied!") : (ru ? "Код" : "Code")}
              </button>
            </div>
          </div>
        </div>

        {/* Как вступить */}
        <div style={S.card}>
          <p style={S.cardTitle}>{ru ? "Как вступить" : "How to join"}</p>
          {[
            { n: 1, text: ru ? "Нажми «Поделиться в Telegram» и отправь ссылку коллеге" : "Tap 'Share to Telegram' and send link to colleague" },
            { n: 2, text: ru ? "Коллега нажимает ссылку → открывает приложение → вступает автоматически" : "Colleague taps link → opens app → joins automatically" },
            { n: 3, text: ru ? "Или: введи код вручную: Команды → Вступить → ввести код" : "Or: enter code manually: Teams → Join → enter code" },
          ].map((s) => (
            <div key={s.n} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${theme.primary}20`, border: `1px solid ${theme.primary}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: theme.primary }}>{s.n}</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.5 }}>{s.text}</p>
            </div>
          ))}
        </div>

        {/* Текущие участники */}
        <div style={S.card}>
          <p style={S.cardTitle}>{ru ? `В команде (${members.length})` : `Team members (${members.length})`}</p>
          {members.map((m) => (
            <div key={m.uid} style={{ ...S.memberRow, marginBottom: 6 }}>
              <MemberAvatar displayName={m.displayName} photoUrl={m.photoUrl} size={30} color={theme.primary} />
              <p style={{ fontSize: 13, color: "#fff", margin: 0, flex: 1 }}>{m.displayName}</p>
              <RoleBadge role={m.role} ru={ru} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
