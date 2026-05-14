import { useState } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { ChevronRight, ArrowLeft } from "lucide-react";
import SettingsPage from "./SettingsPage";
import WeeklyGoalsPage from "./WeeklyGoalsPage";
import TeamPage from "./TeamPage";

type SubView = null | "settings" | "goals" | "team";

export default function MorePage() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const [subView, setSubView] = useState<SubView>(null);

  const BackBtn = ({ label }: { label: string }) => (
    <button
      onClick={() => setSubView(null)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "rgba(255,255,255,0.5)",
        fontSize: "13px",
        padding: "0 0 14px 0",
      }}
    >
      <ArrowLeft size={14} />
      {label}
    </button>
  );

  if (subView === "settings") {
    return (
      <div>
        <BackBtn label={ru ? "Назад" : "Back"} />
        <SettingsPage />
      </div>
    );
  }

  if (subView === "goals") {
    return (
      <div>
        <BackBtn label={ru ? "Назад" : "Back"} />
        <WeeklyGoalsPage />
      </div>
    );
  }

  if (subView === "team") {
    return (
      <div>
        <BackBtn label={ru ? "Назад" : "Back"} />
        <TeamPage />
      </div>
    );
  }

  const menuItems = [
    {
      id: "team",
      emoji: "👥",
      label: ru ? "Команда" : "Team",
      desc: ru
        ? "Пространства, участники, задачи"
        : "Workspaces, members, tasks",
      color: "#f59e0b",
    },
    {
      id: "goals",
      emoji: "🎯",
      label: ru ? "Цели на неделю" : "Weekly Goals",
      desc: ru ? "Планируй и отслеживай цели" : "Plan and track your goals",
      color: "#22c55e",
    },
    {
      id: "settings",
      emoji: "⚙️",
      label: ru ? "Настройки" : "Settings",
      desc: ru
        ? "Тема, язык, мотивация, аккаунт"
        : "Theme, language, motivation, account",
      color: "#6366f1",
    },
  ];

  return (
    <div style={{ paddingTop: "8px" }}>
      <p
        style={{
          fontSize: "22px",
          fontWeight: 700,
          color: "white",
          margin: "0 0 20px 0",
        }}
      >
        {ru ? "Ещё" : "More"}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setSubView(item.id as SubView)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "14px 16px",
              borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.07)",
              backgroundColor: "rgba(255,255,255,0.05)",
              cursor: "pointer",
              textAlign: "left" as const,
              width: "100%",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                backgroundColor: `${item.color}20`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                flexShrink: 0,
              }}
            >
              {item.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "white",
                  margin: 0,
                }}
              >
                {item.label}
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.4)",
                  margin: 0,
                }}
              >
                {item.desc}
              </p>
            </div>
            <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
          </button>
        ))}
      </div>

      <p
        style={{
          fontSize: "11px",
          color: "rgba(255,255,255,0.2)",
          textAlign: "center" as const,
          marginTop: "32px",
        }}
      >
        CortexAI v2.0
      </p>
    </div>
  );
}
