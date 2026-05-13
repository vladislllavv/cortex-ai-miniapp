import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { useTaskStore } from "@/lib/store";
import { getTelegramUserId } from "@/lib/store";
import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export default function WorkspaceBar() {
  const { workspaces, activeWorkspace, setActiveWorkspaceId } = useWorkspace();
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const [open, setOpen] = useState(false);

  // Если только личный workspace — не показываем бар
  if (workspaces.length <= 1) return null;

  return (
    <div style={{ position: "relative", marginBottom: "10px" }}>
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
          maxWidth: "200px",
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
          {/* Backdrop */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
            }}
            onClick={() => setOpen(false)}
          />
          {/* Dropdown */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 100,
              backgroundColor: "#1e293b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              overflow: "hidden",
              minWidth: "180px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  const userId = getTelegramUserId();
                  setActiveWorkspaceId(ws.id);
                  useTaskStore.getState().setActiveWorkspaceId(ws.id);
                  useTaskStore.getState().loadUserData(userId, ws.id);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "10px 12px",
                  border: "none",
                  backgroundColor:
                    activeWorkspace?.id === ws.id
                      ? `${theme.primary}15`
                      : "transparent",
                  cursor: "pointer",
                  textAlign: "left" as const,
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span style={{ fontSize: "16px" }}>{ws.emoji || "📁"}</span>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: activeWorkspace?.id === ws.id ? 600 : 400,
                    color:
                      activeWorkspace?.id === ws.id
                        ? theme.primary
                        : "rgba(255,255,255,0.8)",
                    flex: 1,
                  }}
                >
                  {ws.name}
                </span>
                {activeWorkspace?.id === ws.id && (
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
