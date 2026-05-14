import { useState, useEffect } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { useTeamStore, Role } from "@/lib/teamStore";
import { getTelegramUserId } from "@/lib/store";
import {
  copyInviteCode,
  copyInviteLink,
  shareInviteToTelegram,
  parseStartParam,
  triggerHaptic,
  tgConfirm,
  getTelegramUser,
} from "@/lib/telegram";
import {
  Plus,
  Users,
  Copy,
  Check,
  Crown,
  Shield,
  User as UserIcon,
  Trash2,
  BarChart2,
  CheckSquare,
  UserPlus,
  X,
  ChevronRight,
  AlertCircle,
  Send,
  Link2,
  LogOut,
} from "lucide-react";

type View =
  | "list"
  | "create"
  | "join"
  | "workspace"
  | "tasks"
  | "invite"
  | "stats";

function RoleBadge({ role, ru }: { role: Role; ru: boolean }) {
  const cfg = {
    owner: { icon: Crown, color: "#f59e0b", label: ru ? "Владелец" : "Owner" },
    admin: { icon: Shield, color: "#6366f1", label: ru ? "Админ" : "Admin" },
    member: { icon: UserIcon, color: "#22c55e", label: ru ? "Участник" : "Member" },
  } as const;
  const { icon: Icon, color, label } = cfg[role];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        backgroundColor: `${color}20`,
        borderRadius: "6px",
        padding: "3px 7px",
      }}
    >
      <Icon size={11} color={color} />
      <span style={{ fontSize: "11px", color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

export default function TeamPage() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";

  const uid = getTelegramUserId();
  const tgUser = getTelegramUser();
  const userName =
    tgUser?.first_name || tgUser?.username || (uid !== "unknown" ? uid.slice(0, 6) : "User");

  const {
    workspaces,
    currentWsId,
    members,
    tasks,
    loading,
    subscribeWorkspaces,
    selectWorkspace,
    createWorkspace,
    joinByCode,
    leaveWorkspace,
    deleteWorkspace,
    changeRole,
    removeMember,
    createTask,
    toggleTask,
    deleteTask,
  } = useTeamStore();

  const [view, setView] = useState<View>("list");
  const [error, setError] = useState("");
  const [copiedKind, setCopiedKind] = useState<"code" | "link" | null>(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");

  useEffect(() => {
    if (uid && uid !== "unknown") subscribeWorkspaces(uid);
  }, [uid]);

  // Авто-обработка инвайта из start_param Telegram
  useEffect(() => {
    if (!uid || uid === "unknown") return;
    const param = parseStartParam();
    if (param?.type === "join") {
      setJoinCode(param.code);
      setView("join");
    }
  }, [uid]);

  const currentWs = workspaces.find((w) => w.id === currentWsId);
  const myMember = members.find((m) => m.uid === uid);
  const myRole: Role = myMember?.role || "member";
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  // ─── Действия ───

  const handleCreate = async () => {
    if (!newName.trim() || !uid || uid === "unknown") return;
    setError("");
    try {
      const wsId = await createWorkspace(newName, newDesc, uid, userName);
      setNewName("");
      setNewDesc("");
      selectWorkspace(wsId);
      setView("workspace");
      triggerHaptic("success");
    } catch (e: any) {
      setError(e.message || "Error");
      triggerHaptic("error");
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || !uid || uid === "unknown") return;
    setError("");
    try {
      const wsId = await joinByCode(
        joinCode,
        uid,
        userName,
        tgUser?.username
      );
      setJoinCode("");
      selectWorkspace(wsId);
      setView("workspace");
      triggerHaptic("success");
    } catch (e: any) {
      const code = e.message;
      if (code === "CODE_NOT_FOUND") setError(ru ? "Код не найден" : "Code not found");
      else if (code === "ALREADY_MEMBER")
        setError(ru ? "Ты уже в этом пространстве" : "Already a member");
      else setError(ru ? "Ошибка" : "Error");
      triggerHaptic("error");
    }
  };

  const handleLeave = async () => {
    if (!currentWs || !uid || uid === "unknown") return;
    const ok = await tgConfirm(
      ru ? `Покинуть «${currentWs.name}»?` : `Leave "${currentWs.name}"?`
    );
    if (!ok) return;
    await leaveWorkspace(currentWs.id, uid);
    selectWorkspace(null);
    setView("list");
    triggerHaptic("success");
  };

  const handleDeleteWs = async () => {
    if (!currentWs) return;
    const ok = await tgConfirm(
      ru
        ? `Удалить «${currentWs.name}»? Это действие необратимо.`
        : `Delete "${currentWs.name}"? This cannot be undone.`
    );
    if (!ok) return;
    await deleteWorkspace(currentWs.id);
    selectWorkspace(null);
    setView("list");
    triggerHaptic("success");
  };

  const handleCopyCode = async () => {
    if (!currentWs) return;
    await copyInviteCode(currentWs.inviteCode);
    setCopiedKind("code");
    setTimeout(() => setCopiedKind(null), 2000);
  };

  const handleCopyLink = async () => {
    if (!currentWs) return;
    await copyInviteLink(currentWs.inviteCode);
    setCopiedKind("link");
    setTimeout(() => setCopiedKind(null), 2000);
  };

  const handleShareTg = () => {
    if (!currentWs) return;
    shareInviteToTelegram(currentWs.inviteCode, currentWs.name, ru);
    triggerHaptic("light");
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !currentWs || !uid || uid === "unknown") return;
    const assignee = members.find((m) => m.uid === taskAssignee);
    await createTask(currentWs.id, {
      title: taskTitle.trim(),
      assigneeId: taskAssignee || null,
      assigneeName: assignee?.displayName || null,
      createdBy: uid,
      createdByName: userName,
      priority: taskPriority,
    });
    setTaskTitle("");
    setTaskAssignee("");
    setTaskPriority("medium");
    triggerHaptic("success");
  };

  // ─── Если нет user ───
  if (!uid || uid === "unknown") {
    return (
      <div style={{ paddingTop: "40px", textAlign: "center" }}>
        <AlertCircle size={40} color="rgba(255,255,255,0.3)" />
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", marginTop: "12px" }}>
          {ru
            ? "Открой приложение через Telegram"
            : "Open the app via Telegram"}
        </p>
      </div>
    );
  }

  // ─── Рендер ───

  if (view === "list") {
    return (
      <div style={{ paddingTop: "4px" }}>
        <div style={headerRow}>
          <p style={pageTitle}>{ru ? "Команды" : "Teams"}</p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={() => { setError(""); setView("join"); }} style={smallBtn}>
              <UserPlus size={13} />
              {ru ? "Вступить" : "Join"}
            </button>
            <button
              onClick={() => { setError(""); setView("create"); }}
              style={{ ...smallBtn, backgroundColor: theme.primary, borderColor: theme.primary }}
            >
              <Plus size={13} />
              {ru ? "Создать" : "Create"}
            </button>
          </div>
        </div>

        {workspaces.length === 0 ? (
          <div style={emptyBox}>
            <Users size={40} color="rgba(255,255,255,0.2)" />
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "13px", textAlign: "center", margin: "12px 0 0", lineHeight: 1.5 }}>
              {ru
                ? "Пока нет командных пространств.\nСоздай новое или вступи по коду."
                : "No team workspaces yet.\nCreate one or join with a code."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  selectWorkspace(ws.id);
                  setView("workspace");
                  triggerHaptic("light");
                }}
                style={wsCard}
              >
                <div style={wsIcon(theme.primary)}>{ws.emoji || "👥"}</div>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <p style={wsTitle}>{ws.name}</p>
                  <p style={wsSub}>
                    {ws.memberIds.length} {ru ? "участн." : "members"}
                    {ws.description ? ` · ${ws.description}` : ""}
                  </p>
                </div>
                {ws.ownerId === uid && <Crown size={13} color="#f59e0b" />}
                <ChevronRight size={15} color="rgba(255,255,255,0.3)" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (view === "create") {
    return (
      <div>
        <BackHeader title={ru ? "Новое пространство" : "New Workspace"} onBack={() => setView("list")} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={lbl}>{ru ? "Название *" : "Name *"}</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={ru ? "Команда Альфа" : "Team Alpha"}
              maxLength={50}
              style={inp}
            />
          </div>
          <div>
            <label style={lbl}>{ru ? "Описание" : "Description"}</label>
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder={ru ? "Кратко о команде" : "Short description"}
              maxLength={100}
              style={inp}
            />
          </div>
          {error && <ErrorBox text={error} />}
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || loading}
            style={primaryBtn(theme.primary, !newName.trim() || loading)}
          >
            {loading ? "..." : ru ? "Создать" : "Create"}
          </button>
        </div>
      </div>
    );
  }

  if (view === "join") {
    return (
      <div>
        <BackHeader title={ru ? "Вступить в команду" : "Join Team"} onBack={() => setView("list")} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={lbl}>{ru ? "Код приглашения" : "Invite Code"}</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="XXXXXXXX"
              maxLength={8}
              style={{ ...inp, letterSpacing: "4px", fontWeight: 700, fontSize: "18px", textAlign: "center" }}
            />
          </div>
          {error && <ErrorBox text={error} />}
          <button
            onClick={handleJoin}
            disabled={joinCode.length !== 8 || loading}
            style={primaryBtn(theme.primary, joinCode.length !== 8 || loading)}
          >
            {loading ? "..." : ru ? "Вступить" : "Join"}
          </button>
        </div>
      </div>
    );
  }

  if (view === "workspace" && currentWs) {
    return (
      <div>
        <BackHeader
          title={currentWs.name}
          onBack={() => { selectWorkspace(null); setView("list"); }}
          right={<RoleBadge role={myRole} ru={ru} />}
        />

        {currentWs.description && (
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "0 0 14px", lineHeight: 1.5 }}>
            {currentWs.description}
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
          {[
            { id: "tasks" as View, icon: CheckSquare, label: ru ? "Задачи" : "Tasks", color: "#22c55e" },
            { id: "invite" as View, icon: UserPlus, label: ru ? "Инвайт" : "Invite", color: "#6366f1" },
            { id: "stats" as View, icon: BarChart2, label: ru ? "Стата" : "Stats", color: "#f59e0b" },
          ].map(({ id, icon: Icon, label, color }) => (
            <button
              key={id}
              onClick={() => { setView(id); triggerHaptic("light"); }}
              style={navCard(color)}
            >
              <Icon size={20} color={color} />
              <span style={{ fontSize: "12px", color: "white", fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>

        <div style={card}>
          <p style={cardTitle}>
            {ru ? `Участники (${members.length})` : `Members (${members.length})`}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {members.map((m) => (
              <div key={m.uid} style={memberRow}>
                <div style={avatar(theme.primary)}>{m.displayName.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "14px", fontWeight: 600, color: "white", margin: 0 }}>
                    {m.displayName}
                    {m.uid === uid && (
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", marginLeft: "6px" }}>
                        ({ru ? "ты" : "you"})
                      </span>
                    )}
                  </p>
                  {m.username && (
                    <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
                      @{m.username}
                    </p>
                  )}
                </div>
                {canManage && m.uid !== uid && m.role !== "owner" ? (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(currentWs.id, m.uid, e.target.value as Role)}
                    style={roleSel}
                  >
                    <option value="member">{ru ? "Участник" : "Member"}</option>
                    <option value="admin">{ru ? "Админ" : "Admin"}</option>
                  </select>
                ) : (
                  <RoleBadge role={m.role} ru={ru} />
                )}
                {isOwner && m.uid !== uid && (
                  <button
                    onClick={async () => {
                      const ok = await tgConfirm(
                        ru ? `Удалить ${m.displayName}?` : `Remove ${m.displayName}?`
                      );
                      if (ok) await removeMember(currentWs.id, m.uid);
                    }}
                    style={iconBtn}
                  >
                    <X size={12} color="rgba(239,68,68,0.7)" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {!isOwner && (
            <button onClick={handleLeave} style={dangerBtn}>
              <LogOut size={14} />
              {ru ? "Покинуть пространство" : "Leave Workspace"}
            </button>
          )}
          {isOwner && (
            <button onClick={handleDeleteWs} style={dangerBtn}>
              <Trash2 size={14} />
              {ru ? "Удалить пространство" : "Delete Workspace"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === "tasks" && currentWs) {
    const priorityColors = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
    const sortedTasks = [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return b.createdAt - a.createdAt;
    });

    return (
      <div>
        <BackHeader title={ru ? "Общие задачи" : "Shared Tasks"} onBack={() => setView("workspace")} />

        {canManage && (
          <div style={{ ...card, marginBottom: "12px" }}>
            <p style={cardTitle}>{ru ? "Новая задача" : "New Task"}</p>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={ru ? "Название..." : "Title..."}
              style={{ ...inp, marginBottom: "8px" }}
            />
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <select
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                style={{ ...roleSel, flex: 1, fontSize: "13px" }}
              >
                <option value="">{ru ? "Не назначено" : "Unassigned"}</option>
                {members.map((m) => (
                  <option key={m.uid} value={m.uid}>{m.displayName}</option>
                ))}
              </select>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as any)}
                style={{ ...roleSel, fontSize: "13px" }}
              >
                <option value="low">🟢 {ru ? "Низкий" : "Low"}</option>
                <option value="medium">🟡 {ru ? "Средний" : "Med"}</option>
                <option value="high">🔴 {ru ? "Высокий" : "High"}</option>
              </select>
            </div>
            <button
              onClick={handleCreateTask}
              disabled={!taskTitle.trim()}
              style={primaryBtn(theme.primary, !taskTitle.trim())}
            >
              <Plus size={14} />
              {ru ? "Добавить" : "Add"}
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {sortedTasks.length === 0 ? (
            <div style={emptyBox}>
              <CheckSquare size={32} color="rgba(255,255,255,0.2)" />
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", marginTop: "10px" }}>
                {ru ? "Задач пока нет" : "No tasks yet"}
              </p>
            </div>
          ) : (
            sortedTasks.map((task) => (
              <div key={task.id} style={taskCard}>
                <button
                  onClick={() => { toggleTask(currentWs.id, task.id, task.completed); triggerHaptic("light"); }}
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
                    padding: 0,
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
                  <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "2px 0 0" }}>
                    {task.assigneeName ? `→ ${task.assigneeName}` : ru ? "не назначено" : "unassigned"}
                    {task.createdByName && ` · ${ru ? "от" : "by"} ${task.createdByName}`}
                  </p>
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
                {(canManage || task.createdBy === uid) && (
                  <button onClick={() => deleteTask(currentWs.id, task.id)} style={iconBtn}>
                    <Trash2 size={12} color="rgba(239,100,100,0.6)" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (view === "invite" && currentWs) {
    return (
      <div>
        <BackHeader title={ru ? "Пригласить" : "Invite"} onBack={() => setView("workspace")} />

        <div style={card}>
          <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", margin: "0 0 14px", lineHeight: 1.5 }}>
            {ru
              ? "Поделись ссылкой через Telegram — получатель сразу попадёт в команду."
              : "Share via Telegram — recipient joins instantly."}
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
            <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "1px" }}>
              {ru ? "Код" : "Code"}
            </p>
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

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <button
              onClick={handleShareTg}
              style={{ ...primaryBtn(theme.primary, false), gap: "8px" }}
            >
              <Send size={16} />
              {ru ? "Поделиться в Telegram" : "Share to Telegram"}
            </button>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleCopyLink}
                style={{
                  ...secondaryBtn,
                  backgroundColor: copiedKind === "link" ? "#22c55e30" : "rgba(255,255,255,0.06)",
                  borderColor: copiedKind === "link" ? "#22c55e60" : "rgba(255,255,255,0.1)",
                }}
              >
                {copiedKind === "link" ? <Check size={14} color="#22c55e" /> : <Link2 size={14} />}
                {copiedKind === "link" ? (ru ? "Готово" : "Done") : (ru ? "Ссылка" : "Link")}
              </button>
              <button
                onClick={handleCopyCode}
                style={{
                  ...secondaryBtn,
                  backgroundColor: copiedKind === "code" ? "#22c55e30" : "rgba(255,255,255,0.06)",
                  borderColor: copiedKind === "code" ? "#22c55e60" : "rgba(255,255,255,0.1)",
                }}
              >
                {copiedKind === "code" ? <Check size={14} color="#22c55e" /> : <Copy size={14} />}
                {copiedKind === "code" ? (ru ? "Готово" : "Done") : (ru ? "Код" : "Code")}
              </button>
            </div>
          </div>
        </div>

        <div style={{ ...card, marginTop: "12px" }}>
          <p style={cardTitle}>{ru ? `Уже в команде (${members.length})` : `Already in team (${members.length})`}</p>
          {members.map((m) => (
            <div key={m.uid} style={{ ...memberRow, marginBottom: "8px" }}>
              <div style={avatar(theme.primary)}>{m.displayName.charAt(0).toUpperCase()}</div>
              <p style={{ fontSize: "13px", color: "white", margin: 0, flex: 1 }}>{m.displayName}</p>
              <RoleBadge role={m.role} ru={ru} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "stats" && currentWs) {
    const total = tasks.length;
    const done = tasks.filter((t) => t.completed).length;
    const completion = total > 0 ? Math.round((done / total) * 100) : 0;
    const pending = total - done;

    const memberStats = members
      .map((m) => {
        const assigned = tasks.filter((t) => t.assigneeId === m.uid);
        const compl = assigned.filter((t) => t.completed);
        return {
          ...m,
          assigned: assigned.length,
          done: compl.length,
          rate: assigned.length > 0 ? Math.round((compl.length / assigned.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.rate - a.rate);

    return (
      <div>
        <BackHeader title={ru ? "Статистика" : "Stats"} onBack={() => setView("workspace")} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          {[
            { icon: CheckSquare, label: ru ? "Всего" : "Total", value: total, color: theme.primary },
            { icon: Check, label: ru ? "Готово" : "Done", value: done, color: "#22c55e" },
            { icon: AlertCircle, label: ru ? "Открыто" : "Pending", value: pending, color: "#f59e0b" },
            { icon: Users, label: ru ? "Участников" : "Members", value: members.length, color: "#6366f1" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} style={statCard(color)}>
              <Icon size={18} color={color} />
              <p style={{ fontSize: "26px", fontWeight: 800, color: "white", margin: "6px 0 2px" }}>
                {value}
              </p>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", margin: 0 }}>{label}</p>
            </div>
          ))}
        </div>

        <div style={{ ...card, marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <p style={cardTitle}>{ru ? "Общий прогресс" : "Overall Progress"}</p>
            <p style={{ fontSize: "14px", color: theme.primary, fontWeight: 700, margin: 0 }}>
              {completion}%
            </p>
          </div>
          <div style={{ height: "10px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "5px", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${completion}%`,
                background: `linear-gradient(90deg, ${theme.primary}, #22c55e)`,
                borderRadius: "5px",
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>

        <div style={card}>
          <p style={cardTitle}>{ru ? "Топ участников" : "Top Members"}</p>
          {memberStats.map((m, idx) => (
            <div key={m.uid} style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                {idx < 3 && (
                  <span style={{ fontSize: "13px" }}>
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                  </span>
                )}
                <p style={{ fontSize: "13px", color: "white", margin: 0, flex: 1, fontWeight: 500 }}>
                  {m.displayName}
                </p>
                <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", margin: 0 }}>
                  {m.done}/{m.assigned} ({m.rate}%)
                </p>
              </div>
              <div style={{ height: "5px", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${m.rate}%`,
                    backgroundColor: m.rate >= 70 ? "#22c55e" : m.rate >= 40 ? "#f59e0b" : "#ef4444",
                    borderRadius: "3px",
                    transition: "width 0.4s ease",
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

// ─── Подкомпоненты ───

function BackHeader({
  title, onBack, right,
}: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
        <button
          onClick={() => { onBack(); triggerHaptic("light"); }}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            cursor: "pointer",
            color: "rgba(255,255,255,0.7)",
            fontSize: "16px",
            width: "30px",
            height: "30px",
            borderRadius: "9px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          ←
        </button>
        <p style={{
          fontSize: "18px",
          fontWeight: 700,
          color: "white",
          margin: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
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

// ─── Стили ───

const headerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "18px",
};

const pageTitle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "white",
  margin: 0,
};

const inp: React.CSSProperties = {
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

const lbl: React.CSSProperties = {
  fontSize: "12px",
  color: "rgba(255,255,255,0.45)",
  display: "block",
  marginBottom: "6px",
};

const primaryBtn = (color: string, disabled: boolean): React.CSSProperties => ({
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
});

const secondaryBtn: React.CSSProperties = {
  flex: 1,
  padding: "11px",
  borderRadius: "11px",
  border: "1px solid rgba(255,255,255,0.1)",
  backgroundColor: "rgba(255,255,255,0.06)",
  color: "white",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
};

const dangerBtn: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "11px",
  border: "1px solid rgba(239,68,68,0.25)",
  backgroundColor: "rgba(239,68,68,0.08)",
  color: "#ef4444",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
};

const smallBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "5px",
  padding: "7px 11px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.12)",
  backgroundColor: "rgba(255,255,255,0.07)",
  color: "white",
  fontSize: "12px",
  fontWeight: 600,
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

const wsIcon = (color: string): React.CSSProperties => ({
  width: "44px",
  height: "44px",
  borderRadius: "12px",
  backgroundColor: `${color}25`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "22px",
  flexShrink: 0,
});

const wsTitle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "white",
  margin: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const wsSub: React.CSSProperties = {
  fontSize: "12px",
  color: "rgba(255,255,255,0.4)",
  margin: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const card: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.04)",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.07)",
  padding: "14px",
};

const cardTitle: React.CSSProperties = {
  fontSize: "12px",
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
  width: "26px",
  height: "26px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "rgba(255,255,255,0.05)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const roleSel: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  padding: "5px 8px",
  color: "white",
  fontSize: "12px",
  cursor: "pointer",
  outline: "none",
};

const avatar = (color: string): React.CSSProperties => ({
  width: "34px",
  height: "34px",
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

const navCard = (color: string): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "14px 8px",
  borderRadius: "14px",
  border: `1px solid ${color}20`,
  backgroundColor: `${color}08`,
  cursor: "pointer",
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
