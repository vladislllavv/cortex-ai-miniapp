import { useMemo } from "react";
import { Bell, CheckSquare } from "lucide-react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { useTaskStore, getTelegramUserId } from "@/lib/store";
import { useTeamStore } from "@/lib/teamStore";
import { PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";
import { triggerHaptic } from "@/lib/telegram";
import { useNavStore } from "@/lib/navStore";

export default function AssignedTasksBanner() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const uid = getTelegramUserId();

  const tasks = useTaskStore((s) => s.tasks);
  const activeWorkspaceId = useTaskStore((s) => s.activeWorkspaceId);
  const { tasks: teamTasks, workspaces } = useTeamStore();
  const goToMoreTeam = useNavStore((s) => s.goToMoreTeam);

  // Считаем задачи назначенные мне во всех командах
  const myAssignedTasks = useMemo(() => {
    if (!uid || uid === "unknown") return [];

    // 1. Из текущего workspace (если это команда)
    const fromCurrentTaskStore = tasks.filter(
      (t) =>
        t.assigneeUserId === uid &&
        t.status !== "done" &&
        (t.workspaceId || PERSONAL_WORKSPACE_ID) !== PERSONAL_WORKSPACE_ID
    );

    // 2. Из team store (общие задачи команд)
    const fromTeamStore = teamTasks
      .filter((t) => t.assigneeId === uid && !t.completed)
      .map((t) => ({
        id: t.id,
        title: t.title,
        workspaceName: workspaces.find((w) => w.id === activeWorkspaceId)?.name || "",
      }));

    // Объединяем (приоритет teamStore так как там свежие данные)
    const allIds = new Set(fromCurrentTaskStore.map((t) => t.id));
    const merged = [
      ...fromCurrentTaskStore.map((t) => ({
        id: t.id,
        title: t.title,
        workspaceName: workspaces.find((w) => w.id === t.workspaceId)?.name || "",
      })),
      ...fromTeamStore.filter((t) => !allIds.has(t.id)),
    ];

    return merged;
  }, [tasks, teamTasks, uid, activeWorkspaceId, workspaces]);

  if (myAssignedTasks.length === 0) return null;

  return (
    <button
      onClick={() => {
        triggerHaptic("light");
        goToMoreTeam();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "100%",
        backgroundColor: `${theme.primary}15`,
        border: `1px solid ${theme.primary}30`,
        borderRadius: "12px",
        padding: "10px 12px",
        marginBottom: "12px",
        cursor: "pointer",
        textAlign: "left" as const,
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "10px",
          backgroundColor: `${theme.primary}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <Bell size={16} color={theme.primary} />
        {myAssignedTasks.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              minWidth: "16px",
              height: "16px",
              borderRadius: "8px",
              backgroundColor: "#ef4444",
              color: "white",
              fontSize: "10px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              border: "2px solid #1a1a1f",
            }}
          >
            {myAssignedTasks.length}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: theme.primary,
            margin: 0,
          }}
        >
          {ru
            ? `Тебе назначено ${myAssignedTasks.length} ${
                myAssignedTasks.length === 1
                  ? "задача"
                  : myAssignedTasks.length < 5
                  ? "задачи"
                  : "задач"
              }`
            : `${myAssignedTasks.length} task${
                myAssignedTasks.length === 1 ? "" : "s"
              } assigned to you`}
        </p>
        <p
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.5)",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {myAssignedTasks
            .slice(0, 2)
            .map((t) => t.title)
            .join(" · ")}
          {myAssignedTasks.length > 2 && ` · +${myAssignedTasks.length - 2}`}
        </p>
      </div>
      <CheckSquare size={14} color="rgba(255,255,255,0.3)" />
    </button>
  );
}
