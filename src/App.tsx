import { useState } from "react";
import { Home, Calendar, Bot, Settings } from "lucide-react";
import HomePage from "@/pages/HomePage";
import CalendarPage from "@/pages/CalendarPage";
import AiProcessPage from "@/pages/AiProcessPage";
import SettingsPage from "@/pages/SettingsPage";
import AddBtn from "@/components/AddBtn";
import { usePersistTasks } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";

type Tab = "home" | "calendar" | "ai" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const language = useI18nStore((state) => state.language);
  const ru = language === "ru";

  usePersistTasks();

  const tabs = [
    { id: "home" as Tab, icon: Home, label: ru ? "Главная" : "Home" },
    { id: "calendar" as Tab, icon: Calendar, label: ru ? "Календарь" : "Calendar" },
    { id: "ai" as Tab, icon: Bot, label: "AI" },
    { id: "settings" as Tab, icon: Settings, label: ru ? "Настройки" : "Settings" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0f172a",
        color: "white",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflowX: "hidden",
      }}
    >
      {/* Контент */}
      <div
        style={{
          padding: "16px 16px 90px 16px",
          width: "100%",
          boxSizing: "border-box",
          maxWidth: "480px",
          margin: "0 auto",
          minHeight: "100vh",
        }}
      >
        {tab === "home" && <HomePage />}
        {tab === "calendar" && <CalendarPage />}
        {tab === "ai" && <AiProcessPage />}
        {tab === "settings" && <SettingsPage />}
      </div>

      {/* Кнопка + только на главной */}
      {tab === "home" && <AddBtn />}

      {/* Нижняя навигация */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          backgroundColor: "rgba(10,15,30,0.97)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            alignItems: "center",
            maxWidth: "480px",
            margin: "0 auto",
            padding: "10px 0 20px 0",
          }}
        >
          {tabs.map(({ id, icon: Icon, label }) => {
            const isActive = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 20px",
                  borderRadius: "14px",
                  transition: "all 0.2s ease",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <Icon
                  size={24}
                  color={isActive ? "#3b82f6" : "rgba(255,255,255,0.35)"}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#3b82f6" : "rgba(255,255,255,0.35)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
