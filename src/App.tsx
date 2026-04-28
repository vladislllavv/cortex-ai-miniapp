import { useState, useEffect } from "react";
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

  // Раскрываем Telegram Mini App на весь экран
  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.expand();
        tg.ready();
      }
    } catch {}

    // Фиксим высоту для мобильных
    const setHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    setHeight();
    window.addEventListener("resize", setHeight);
    return () => window.removeEventListener("resize", setHeight);
  }, []);

  const tabs = [
    { id: "home" as Tab, icon: Home, label: ru ? "Главная" : "Home" },
    { id: "calendar" as Tab, icon: Calendar, label: ru ? "Календарь" : "Calendar" },
    { id: "ai" as Tab, icon: Bot, label: "AI" },
    { id: "settings" as Tab, icon: Settings, label: ru ? "Настройки" : "Settings" },
  ];

  return (
    <>
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body, #root {
          height: 100%;
          overflow: hidden;
          background-color: #0f172a;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#0f172a",
          color: "white",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Основной контент — прокручивается */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            paddingBottom: "80px",
          }}
        >
          <div
            style={{
              padding: "12px 16px 16px 16px",
              maxWidth: "480px",
              margin: "0 auto",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {tab === "home" && <HomePage />}
            {tab === "calendar" && <CalendarPage />}
            {tab === "ai" && <AiProcessPage />}
            {tab === "settings" && <SettingsPage />}
          </div>
        </div>

        {/* Кнопка + только на главной */}
        {tab === "home" && <AddBtn />}

        {/* Нижняя навигация — ВСЕГДА на месте */}
        <div
          style={{
            position: "relative",
            flexShrink: 0,
            backgroundColor: "rgba(10,15,30,0.98)",
            borderTop: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              maxWidth: "480px",
              margin: "0 auto",
              padding: "8px 0 24px 0",
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
                    gap: "3px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "6px 16px",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <Icon
                    size={22}
                    color={isActive ? "#3b82f6" : "rgba(255,255,255,0.35)"}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "#3b82f6" : "rgba(255,255,255,0.35)",
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
    </>
  );
}
