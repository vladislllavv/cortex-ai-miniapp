import { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { useTaskStore, getTelegramUserId } from "@/lib/store";
import { ChevronDown, Check, Plus, X } from "lucide-react";
import { PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";

export default function WorkspaceBar() {
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    setActiveWorkspaceId,
    createTeamWorkspace,
  } = useWorkspace();
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";

  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("👥");
  const [creating, setCreating] = useState(false);

  // Если только личный — не показываем
  if (workspaces.length <= 1) return null;

  const handleSwitch = (id: string) => {
    const userId = getTelegramUserId();
    setActiveWorkspaceId(id);
    useTaskStore.getState().setActiveWorkspaceId(id);
    useTaskStore.getState().loadUserData(userId, id);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const userId = getTelegramUserId();
      const ws = await createTeamWorkspace(
        userId,
        newName.trim(),
        newEmoji
      );
      handleSwitch(ws.id);
      setNewName("");
      setNewEmoji("👥");
      setShowCreate(false);
    } catch (e) {
      console.error("Create workspace:", e);
    } finally {
      setCreating(false);
    }
  };

  const EMOJIS = ["👥", "💼", "🚀", "🎯", "🏢", "💡", "🔥", "⭐"];

  return (
    <div style={{ position: "relative", marginBottom: "12px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 10px 6px 8px",
          borderRadius: "10px",
          border: `1px solid ${theme.primary}30`,
          backgroundColor: `${theme.primary}10`,
          cursor: "pointer",
          maxWidth: "220px",
        }}
      >
        <span style={{ fontSize: "16px" }}>
          {activeWorkspace?.emoji || "👤"}
        </span>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: theme.primary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {activeWorkspace?.name || (ru ? "Личное" : "Personal")}
        </span>
        <ChevronDown
          size={14}
          color={theme.primary}
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 100,
              backgroundColor: "#1e293b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "14px",
              overflow: "hidden",
              minWidth: "200px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSwitch(ws.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  width: "100%",
                  padding: "11px 14px",
                  border: "none",
                  backgroundColor:
                    activeWorkspaceId === ws.id
                      ? `${theme.primary}15`
                      : "transparent",
                  cursor: "pointer",
                  textAlign: "left" as const,
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <span style={{ fontSize: "18px" }}>
                  {ws.emoji || "📁"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight:
                        activeWorkspaceId === ws.id ? 600 : 400,
                      color:
                        activeWorkspaceId === ws.id
                          ? theme.primary
                          : "rgba(255,255,255,0.85)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ws.name}
                  </p>
                  <p
                    style={{
                      fontSize: "10px",
                      color: "rgba(255,255,255,0.3)",
                      margin: 0,
                    }}
                  >
                    {ws.type === "personal"
                      ? ru ? "Личное" : "Personal"
                      : ru ? "Команда" : "Team"}
                  </p>
                </div>
                {activeWorkspaceId === ws.id && (
                  <Check size={14} color={theme.primary} />
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Модалка создания команды */}
      {showCreate && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#1e293b",
              borderRadius: "20px",
              padding: "20px",
              width: "100%",
              maxWidth: "320px",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <p
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "white",
                  margin: 0,
                }}
              >
                {ru ? "Новая команда" : "New team"}
              </p>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <X size={18} color="rgba(255,255,255,0.4)" />
              </button>
            </div>

            <p
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.4)",
                margin: "0 0 8px 0",
              }}
            >
              {ru ? "Иконка" : "Icon"}
            </p>
            <div
              style={{
                display: "flex",
                gap: "6px",
                marginBottom: "12px",
              }}
            >
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setNewEmoji(e)}
                  style={{
                    width: "34px",
                    height: "34px",
                    fontSize: "18px",
                    borderRadius: "8px",
                    border:
                      newEmoji === e
                        ? `1px solid ${theme.primary}`
                        : "1px solid transparent",
                    backgroundColor:
                      newEmoji === e
                        ? `${theme.primary}20`
                        : "rgba(255,255,255,0.07)",
                    cursor: "pointer",
                  }}
                >
                  {e}
                </button>
              ))}
            </div>

            <p
              style={{
                fontSize: "11px",
                color: "rgba(255,255,255,0.4)",
                margin: "0 0 6px 0",
              }}
            >
              {ru ? "Название команды" : "Team name"}
            </p>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder={
                ru ? "Например: Маркетинг" : "e.g. Marketing"
              }
              style={{
                display: "block",
                width: "100%",
                boxSizing: "border-box" as const,
                height: "42px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "rgba(255,255,255,0.07)",
                paddingLeft: "12px",
                paddingRight: "12px",
                fontSize: "14px",
                color: "white",
                outline: "none",
                fontFamily: "inherit",
                marginBottom: "14px",
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              style={{
                width: "100%",
                height: "44px",
                borderRadius: "12px",
                border: "none",
                backgroundColor:
                  newName.trim() && !creating
                    ? theme.primary
                    : "rgba(255,255,255,0.1)",
                fontSize: "14px",
                fontWeight: 600,
                color: "white",
                cursor:
                  newName.trim() && !creating ? "pointer" : "default",
              }}
            >
              {creating
                ? ru ? "Создаём..." : "Creating..."
                : ru ? "Создать команду" : "Create team"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
