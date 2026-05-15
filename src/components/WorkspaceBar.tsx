import { useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { useTeamStore } from "@/lib/teamStore";
import { getTelegramUserId, useTaskStore } from "@/lib/store";
import { triggerHaptic } from "@/lib/telegram";
import { PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";

const ACTIVE_WS_KEY = "cortex-active-workspace";

export default function WorkspaceBar() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const uid = getTelegramUserId();

  const { workspaces, currentWsId, selectWorkspace, subscribeWorkspaces } =
    useTeamStore();
  const setActiveWorkspaceId = useTaskStore((s) => s.setActiveWorkspaceId);
  const activeWorkspaceId = useTaskStore((s) => s.activeWorkspaceId);
  const loadUserData = useTaskStore((s) => s.loadUserData);
  const startSync = useTaskStore((s) => s.startSync);

  const [open, setOpen] = useState(false);

  // Подписка на список workspaces
  useEffect(() => {
    if (uid && uid !== "unknown") subscribeWorkspaces(uid);
  }, [uid]);

  // Восстанавливаем выбранный workspace из localStorage при загрузке
  useEffect(() => {
    const saved = localStorage.getItem(ACTIVE_WS_KEY);
    if (saved && saved !== activeWorkspaceId) {
      // Если это team workspace — выбираем его
      if (saved !== PERSONAL_WORKSPACE_ID) {
        selectWorkspace(saved);
      }
      setActiveWorkspaceId(saved);
    }
  }, []);

  // Переключение workspace — обновляет store задач и перезагружает данные
  const switchWorkspace = (newWsId: string | null) => {
    const targetId = newWsId || PERSONAL_WORKSPACE_ID;
    if (targetId === activeWorkspaceId) {
      setOpen(false);
      return;
    }

    // Сохраняем выбор
    localStorage.setItem(ACTIVE_WS_KEY, targetId);

    // Обновляем стор команды
    selectWorkspace(newWsId);

    // Обновляем активный workspace в task store
    setActiveWorkspaceId(targetId);

    // Перезагружаем задачи из нового workspace
    if (uid && uid !== "unknown") {
      loadUserData(uid, targetId);
      // Перезапускаем подписку на новый workspace
      const unsub = startSync(uid, targetId);
      // Сохраняем функцию отписки в window для очистки при следующей смене
      const prevUnsub = (window as any).__workspaceUnsub;
      if (prevUnsub) prevUnsub();
      (window as any).__workspaceUnsub = unsub;
    }

    setOpen(false);
    triggerHaptic("light");
  };

  const current = workspaces.find((w) => w.id === currentWsId);
  const personalLabel = ru ? "Личное" : "Personal";

  // Если команд нет — показываем только если активный не личный
  if (workspaces.length === 0 && activeWorkspaceId === PERSONAL_WORKSPACE_ID) {
    return null;
  }

  return (
    <div style={{ position: "relative", marginBottom: "12px" }}>
      <button
        onClick={() => {
          triggerHaptic("light");
          setOpen(!open);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          backgroundColor: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "10px",
          cursor: "pointer",
          width: "100%",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            backgroundColor: `${theme.primary}25`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "15px",
            flexShrink: 0,
          }}
        >
          {current ? current.emoji || "👥" : "👤"}
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <p
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "white",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {current ? current.name : personalLabel}
          </p>
          <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {current
              ? `${current.memberIds.length} ${ru ? "участн." : "members"}`
              : ru ? "Твои задачи" : "Your tasks"}
          </p>
        </div>
        <ChevronDown
          size={14}
          color="rgba(255,255,255,0.5)"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              backgroundColor: "#1a1a1f",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              padding: "6px",
              zIndex: 100,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              maxHeight: "300px",
              overflowY: "auto",
            }}
          >
            <button
              onClick={() => switchWorkspace(null)}
              style={dropdownItemStyle(activeWorkspaceId === PERSONAL_WORKSPACE_ID)}
            >
              <div style={miniIcon("rgba(255,255,255,0.1)")}>👤</div>
              <span style={{ flex: 1, textAlign: "left", fontSize: "13px", color: "white" }}>
                {personalLabel}
              </span>
              {activeWorkspaceId === PERSONAL_WORKSPACE_ID && (
                <Check size={14} color={theme.primary} />
              )}
            </button>

            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => switchWorkspace(ws.id)}
                style={dropdownItemStyle(activeWorkspaceId === ws.id)}
              >
                <div style={miniIcon(`${theme.primary}25`)}>{ws.emoji || "👥"}</div>
                <span
                  style={{
                    flex: 1,
                    textAlign: "left",
                    fontSize: "13px",
                    color: "white",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ws.name}
                </span>
                {activeWorkspaceId === ws.id && (
                  <Check size={14} color={theme.primary} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const dropdownItemStyle = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  padding: "8px 10px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: active ? "rgba(255,255,255,0.06)" : "transparent",
  cursor: "pointer",
});

const miniIcon = (bg: string): React.CSSProperties => ({
  width: "26px",
  height: "26px",
  borderRadius: "7px",
  backgroundColor: bg,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "13px",
  flexShrink: 0,
});
