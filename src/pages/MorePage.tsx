import { useI18nStore } from "@/lib/i18n";
import { ChevronRight, ArrowLeft, Target, Settings, Users, Flame, Download, Search } from "lucide-react";
import SettingsPage from "./SettingsPage";
import WeeklyGoalsPage from "./WeeklyGoalsPage";
import TeamPage from "./TeamPage";
import HabitsPage from "./HabitsPage";
import { useNavStore } from "@/lib/navStore";
import { useTheme } from "@/contexts/ThemeContext";
import { getTelegramUserId, getSafeUserId, useTaskStore } from "@/lib/store";
import { getAccentGradient } from "@/lib/theme";

type SubView = null | "settings" | "goals" | "team" | "habits";

// ─── Export utility ────────────────────────────────────────────────
function exportTasksCSV(tasks: any[], ru: boolean) {
  const header = ru
    ? "Название,Приоритет,Статус,Срок,Тег,Создана\n"
    : "Title,Priority,Status,Due,Tag,Created\n";
  const rows = tasks.map((t) => [
    `"${t.title.replace(/"/g, '""')}"`,
    t.priority,
    t.status,
    t.dueDate ? new Date(t.dueDate).toLocaleDateString("ru-RU") : "",
    (t.tags || []).join("|"),
    new Date(t.createdAt).toLocaleDateString("ru-RU"),
  ].join(",")).join("\n");
  const csv  = header + rows;
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "cortexai_tasks.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function MorePage() {
  const language = useI18nStore((s) => s.language);
  const ru       = language === "ru";
  const subView  = useNavStore((s) => s.moreSubView) as SubView;
  const setSubView = useNavStore((s) => s.setMoreSubView) as (v: SubView) => void;
  const { theme } = useTheme();
  const tasks  = useTaskStore((s) => s.tasks);
  const userId = getTelegramUserId(); // raw TG id for display
  const gradient = getAccentGradient(theme);

  const BackBtn = ({ label }: { label: string }) => (
    <button onClick={() => setSubView(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: 13, padding: "0 0 14px 0", fontFamily: "inherit" }}>
      <ArrowLeft size={16} />{label}
    </button>
  );

  if (subView === "settings") return <div style={{ paddingTop: 4 }}><BackBtn label={ru ? "Назад" : "Back"} /><SettingsPage /></div>;
  if (subView === "goals")    return <div style={{ paddingTop: 4 }}><BackBtn label={ru ? "Назад" : "Back"} /><WeeklyGoalsPage /></div>;
  if (subView === "team")     return <div style={{ paddingTop: 4 }}><BackBtn label={ru ? "Назад" : "Back"} /><TeamPage /></div>;
  if (subView === "habits")   return <div style={{ paddingTop: 4 }}><BackBtn label={ru ? "Назад" : "Back"} /><HabitsPage /></div>;

  const done   = tasks.filter((t) => t.status === "done").length;
  const active = tasks.filter((t) => t.status !== "done").length;

  const menuItems = [
    { id: "habits"   as SubView, Icon: Flame,    label: ru ? "Привычки"       : "Habits",       desc: ru ? "Streak-трекер, ежедневные привычки" : "Streak tracker, daily habits",     color: "#f97316" },
    { id: "team"     as SubView, Icon: Users,    label: ru ? "Команда"        : "Team",          desc: ru ? "Рабочие пространства, задачи вместе" : "Workspaces & collaborative tasks", color: "#f59e0b" },
    { id: "goals"    as SubView, Icon: Target,   label: ru ? "Цели недели"    : "Weekly Goals",  desc: ru ? "Планируй и отслеживай цели"          : "Plan and track your goals",        color: "#22c55e" },
    { id: "settings" as SubView, Icon: Settings, label: ru ? "Настройки"      : "Settings",      desc: ru ? "Тема, язык, мотивация"               : "Theme, language, motivation",     color: "#6366f1" },
  ];

  return (
    <div style={{ paddingTop: 4 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 2px 0" }}>
          {userId !== "unknown" ? `ID: ${userId}` : (ru ? "Гостевой режим" : "Guest mode")}
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.5px" }}>
          {ru ? "Ещё" : "More"}
        </h1>
      </div>

      {/* Quick stats */}
      <div style={{ background: gradient, borderRadius: 18, padding: "14px 18px", marginBottom: 18, display: "flex", gap: 20 }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>{active}</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>{ru ? "Активных" : "Active"}</p>
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.2)" }} />
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>{done}</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>{ru ? "Готово" : "Done"}</p>
        </div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.2)" }} />
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>{tasks.length}</p>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>{ru ? "Всего" : "Total"}</p>
        </div>
      </div>

      {/* Menu items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {menuItems.map(({ id, Icon, label, desc, color }) => (
          <button key={String(id)} onClick={() => setSubView(id)} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
            borderRadius: 18, border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.04)", cursor: "pointer",
            textAlign: "left", width: "100%", fontFamily: "inherit", transition: "background 0.15s",
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: `${color}16`, border: `1px solid ${color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={20} color={color} strokeWidth={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#fff", margin: "0 0 2px 0" }}>{label}</p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>{desc}</p>
            </div>
            <ChevronRight size={16} color="rgba(255,255,255,0.2)" />
          </button>
        ))}
      </div>

      {/* Export */}
      {tasks.length > 0 && (
        <button onClick={() => exportTasksCSV(tasks, ru)} style={{
          width: "100%", height: 46, borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
          color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 500,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit",
          marginBottom: 8,
        }}>
          <Download size={16} />{ru ? "Экспорт задач в CSV" : "Export tasks to CSV"}
        </button>
      )}

      {/* Bot info */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "14px 16px" }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px 0" }}>
          {ru ? "Telegram бот" : "Telegram bot"}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { e: "📝", t: ru ? "/task Купить молоко — создать задачу" : "/task Buy milk — create task" },
            { e: "📋", t: ru ? "/tasks — список задач"               : "/tasks — task list" },
            { e: "⚡", t: "@aiplannerrubot " + (ru ? "задача — из любого чата" : "task — from any chat") },
            { e: "👥", t: ru ? "Добавь в группу для командных задач" : "Add to group for team tasks" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{item.e}</span>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.4 }}>{item.t}</p>
            </div>
          ))}
        </div>
        <button onClick={() => {
          const tg = (window as any).Telegram?.WebApp;
          if (tg?.openTelegramLink) tg.openTelegramLink("https://t.me/aiplannerrubot");
          else window.open("https://t.me/aiplannerrubot", "_blank");
        }} style={{
          marginTop: 12, width: "100%", height: 38, borderRadius: 10,
          border: `1px solid ${theme.primary}30`, background: `${theme.primary}10`,
          color: theme.primary, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        }}>
          @aiplannerrubot
        </button>
      </div>

      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", textAlign: "center", margin: "18px 0 0" }}>CortexAI v3.1</p>
    </div>
  );
}
