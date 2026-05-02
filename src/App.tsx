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

  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        tg.expand();
        tg.ready();
        tg.setHeaderColor?.("#0f172a");
        tg.setBackgroundColor?.("#0f172a");
      }
    } catch {}

    const fixHeight = () => {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight * 0.01}px`
      );
    };

    fixHeight();

    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fixHeight, 150);
    };

    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer);
    };
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
          margin: 0; padding: 0;
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }
        html {
          height: 100%;
          overflow: hidden;
          background: #0f172a;
        }
        body {
          height: 100%;
          overflow: hidden;
          background: #0f172a;
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
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.4; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
        input::placeholder { color: rgba(255,255,255,0.3); }
        ::-webkit-scrollbar { width: 0; height: 0; }
      `}</style>

      <div
        style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "#0f172a",
          color: "white",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
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
            {tab === "settings" && <SettingsPage />}
          </div>
        </div>

        {/* Кнопка + только на главной */}
        {tab === "home" && <AddBtn />}

        {/* Нижняя навигация */}
        <div
          style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            height: "68px",
            backgroundColor: "rgba(10,15,30,0.98)",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            zIndex: 100,
            transform: "translateZ(0)",
            willChange: "transform",
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
                    display: "flex", flexDirection: "column",
                    alignItems: "center", gap: "3px",
                    background: "none", border: "none",
                    cursor: "pointer", padding: "6px 16px",
                    WebkitTapHighlightColor: "transparent",
                    transition: "opacity 0.15s ease",
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
                      transition: "color 0.15s ease",
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
}    fixHeight();

    // Небольшая задержка для корректного получения высоты
    setTimeout(fixHeight, 300);
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
          -webkit-tap-highlight-color: transparent;
        }

        :root {
          --app-height: 100vh;
          --nav-height: 68px;
        }

        html {
          height: 100%;
          overflow: hidden;
          background: #0f172a;
        }

        body {
          height: 100%;
          overflow: hidden;
          background: #0f172a;
          position: fixed;
          width: 100%;
          top: 0;
          left: 0;
        }

        #root {
          height: 100%;
          overflow: hidden;
        }

        /* Запрещаем body скакать при клавиатуре */
        input, textarea, select {
          font-size: 16px !important;
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }

        textarea::placeholder {
          color: rgba(255,255,255,0.3);
        }

        input::placeholder {
          color: rgba(255,255,255,0.3);
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
        {/* Контент */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            paddingBottom: "var(--nav-height)",
            // Не меняем высоту при клавиатуре
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
            {tab === "settings" && <SettingsPage />}
          </div>
        </div>

        {/* Кнопка + */}
        {tab === "home" && <AddBtn />}

        {/* Нижняя навигация — ФИКСИРОВАННАЯ */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: "var(--nav-height)",
            backgroundColor: "rgba(10,15,30,0.98)",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            zIndex: 100,
            // Ключевое — не двигаемся при клавиатуре
            transform: "translateZ(0)",
            willChange: "transform",
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
              paddingBottom: "env(safe-area-inset-bottom, 8px)",
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
                    padding: "6px 20px",
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
