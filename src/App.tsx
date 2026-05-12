import { useState, useEffect } from "react";
import { Home, Calendar, Bot, Settings, Target } from "lucide-react";
import HomePage from "@/pages/HomePage";
import CalendarPage from "@/pages/CalendarPage";
import AiProcessPage from "@/pages/AiProcessPage";
import SettingsPage from "@/pages/SettingsPage";
import WeeklyGoalsPage from "@/pages/WeeklyGoalsPage";
import AddBtn from "@/components/AddBtn";
import { usePersistTasks } from "@/lib/store";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";

type Tab = "home" | "calendar" | "ai" | "goals" | "settings";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const language = useI18nStore((state) => state.language);
  const ru = language === "ru";
  const { theme } = useTheme();

  usePersistTasks();

  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
      }
    } catch {}

    const fixHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    fixHeight();

    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(fixHeight, 100);
    };

    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, []);

  const tabs = [
    { id: "home" as Tab, icon: Home, label: ru ? "Главная" : "Home" },
    { id: "calendar" as Tab, icon: Calendar, label: ru ? "Календарь" : "Calendar" },
    { id: "ai" as Tab, icon: Bot, label: "AI" },
    { id: "goals" as Tab, icon: Target, label: ru ? "Цели" : "Goals" },
    { id: "settings" as Tab, icon: Settings, label: ru ? "Настройки" : "Settings" },
  ];

  return (
    <>
      <style>{`
        * {
          margin: 0; padding: 0;
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }
        html {
          height: 100%;
          overflow: hidden;
        }
        body {
          height: 100%;
          overflow: hidden;
          position: fixed;
          width: 100%;
          top: 0;
          left: 0;
        }
        #root {
          height: 100%;
          overflow: hidden;
        }
        input, textarea, select {
          font-size: 16px !important;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
        input::placeholder { color: rgba(255,255,255,0.3); }
        ::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: theme.bg,
          color: "white",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "background-color 0.3s ease",
        }}
      >
        {/* Основной контент */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch" as any,
            paddingBottom: "68px",
            minHeight: 0,
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
            {tab === "goals" && <WeeklyGoalsPage />}
            {tab === "settings" && <SettingsPage />}
          </div>
        </div>

        {tab === "home" && <AddBtn />}

        {/* Нижняя навигация */}
        <div
          style={{
            position: "fixed",
            bottom: 0, left: 0, right: 0,
            height: "68px",
            backgroundColor: theme.bgNav,
            borderTop: "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            zIndex: 100,
            transform: "translateZ(0)",
            transition: "background-color 0.3s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              height: "100%",
              maxWidth: "480px",
              margin: "0 auto",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
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
                    padding: "4px 10px",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <Icon
                    size={20}
                    color={isActive ? theme.primary : "rgba(255,255,255,0.35)"}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? theme.primary : "rgba(255,255,255,0.35)",
                      transition: "color 0.2s ease",
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
