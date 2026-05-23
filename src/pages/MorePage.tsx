import { useEffect } from "react";
import { useI18nStore } from "@/lib/i18n";
import { ChevronRight, ArrowLeft, Target, Settings, Users } from "lucide-react";
import SettingsPage from "./SettingsPage";
import WeeklyGoalsPage from "./WeeklyGoalsPage";
import TeamPage from "./TeamPage";
import { useNavStore } from "@/lib/navStore";
import { useTheme } from "@/contexts/ThemeContext";
import { getTelegramUserId } from "@/lib/store";

export default function MorePage() {
  const language = useI18nStore((s) => s.language);
  const ru = language === "ru";
  const subView = useNavStore((s) => s.moreSubView);
  const setSubView = useNavStore((s) => s.setMoreSubView);
  const { theme } = useTheme();
  const userId = getTelegramUserId();

  useEffect(() => {}, []);

  const BackBtn = ({ label }: { label: string }) => (
    <button onClick={() => setSubView(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 13, padding: "0 0 16px 0" }}>
      <ArrowLeft size={16} />
      {label}
    </button>
  );

  if (subView === "settings") return <div style={{ paddingTop: 4 }}><BackBtn label={ru ? "Назад" : "Back"} /><SettingsPage /></div>;
  if (subView === "goals")    return <div style={{ paddingTop: 4 }}><BackBtn label={ru ? "Назад" : "Back"} /><WeeklyGoalsPage /></div>;
  if (subView === "team")     return <div style={{ paddingTop: 4 }}><BackBtn label={ru ? "Назад" : "Back"} /><TeamPage /></div>;

  const menuItems = [
    { id: "team"     as const, Icon: Users,   label: ru ? "Команда"       : "Team",         desc: ru ? "Командные пространства и задачи" : "Team workspaces & tasks", color: "#f59e0b" },
    { id: "goals"    as const, Icon: Target,  label: ru ? "Цели на неделю" : "Weekly Goals",  desc: ru ? "Планируй и отслеживай цели"      : "Plan and track goals",    color: "#22c55e" },
    { id: "settings" as const, Icon: Settings, label: ru ? "Настройки"    : "Settings",       desc: ru ? "Тема, язык, мотивация"          : "Theme, language, motivation", color: "#a855f7" },
  ];

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 2px 0" }}>@{userId !== "unknown" ? userId : "—"}</p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.5px" }}>{ru ? "Ещё" : "More"}</h1>
      </div>

      {/* Menu */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {menuItems.map(({ id, Icon, label, desc, color }) => (
          <button key={id} onClick={() => setSubView(id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px", borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.04)", cursor: "pointer", textAlign: "left", width: "100%", transition: "background 0.18s" }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: `${color}18`, border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={20} color={color} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 3px 0" }}>{label}</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>{desc}</p>
            </div>
            <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
          </button>
        ))}
      </div>

      {/* Bot info */}
      <div style={{ marginTop: 24, padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px 0" }}>{ru ? "Бот" : "Bot"}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { emoji: "📝", text: ru ? "/task Название — создать задачу" : "/task Name — create task" },
            { emoji: "📋", text: ru ? "/tasks — мои задачи" : "/tasks — my tasks" },
            { emoji: "⚡", text: ru ? "@aiplannerrubot задача — из любого чата" : "@aiplannerrubot task — from any chat" },
            { emoji: "👥", text: ru ? "Добавь в группу для командных задач" : "Add to group for team tasks" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{item.emoji}</span>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.4 }}>{item.text}</p>
            </div>
          ))}
        </div>
        <button onClick={() => { const tg = (window as any).Telegram?.WebApp; if (tg?.openTelegramLink) tg.openTelegramLink("https://t.me/aiplannerrubot"); else window.open("https://t.me/aiplannerrubot", "_blank"); }} style={{ marginTop: 12, width: "100%", height: 38, borderRadius: 10, border: `1px solid ${theme.primary}30`, background: `${theme.primary}12`, color: theme.primary, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {ru ? "Открыть бота @aiplannerrubot" : "Open bot @aiplannerrubot"}
        </button>
      </div>

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "center", margin: "20px 0 0" }}>CortexAI v3.0</p>
    </div>
  );
}
