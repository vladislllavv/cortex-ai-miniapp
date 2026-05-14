import { useState, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { useTeamStore } from "@/lib/teamStore";
import { triggerHaptic, getTelegramUser } from "@/lib/telegram";

export default function WorkspaceBar() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const tgUser = getTelegramUser();
  const uid = tgUser?.id || null;

  const { workspaces, currentWsId, selectWorkspace, subscribeWorkspaces } =
    useTeamStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (uid) subscribeWorkspaces(uid);
  }, [uid]);

  const current = workspaces.find((w) => w.id === currentWsId);
  const personalLabel = ru ? "Личное" : "Personal";

  if (workspaces.length === 0) return null;

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
              onClick={() => {
                selectWorkspace(null);
                setOpen(false);
                triggerHaptic("light");
              }}
              style={dropdownItemStyle(currentWsId === null)}
            >
              <div style={miniIcon("rgba(255,255,255,0.1)")}>👤</div>
              <span style={{ flex: 1, textAlign: "left", fontSize: "13px", color: "white" }}>
                {personalLabel}
              </span>
              {currentWsId === null && <Check size={14} color={theme.primary} />}
            </button>

            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  selectWorkspace(ws.id);
                  setOpen(false);
                  triggerHaptic("light");
                }}
                style={dropdownItemStyle(currentWsId === ws.id)}
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
                {currentWsId === ws.id && <Check size={14} color={theme.primary} />}
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
