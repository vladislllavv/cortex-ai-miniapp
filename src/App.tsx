import { useState, useEffect } from "react";
import { Home, Calendar, Bot, MoreHorizontal } from "lucide-react";
import HomePage from "@/pages/HomePage";
import CalendarPage from "@/pages/CalendarPage";
import AiHubPage from "@/pages/AiHubPage";
import MorePage from "@/pages/MorePage";
import AddBtn from "@/components/AddBtn";
import WorkspaceBar from "@/components/WorkspaceBar";
import TelegramProvider from "@/components/TelegramProvider";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";

type Tab = "home" | "plan" | "ai" | "more";

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const language = useI18nStore((s) => s.language);
  const ru = language === "ru";
  const { theme } = useTheme();

  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) { tg.ready(); tg.expand(); }
    } catch {}

    const fixHeight = () => {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight * 0.01}px`
      );
    };
    fixHeight();
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(fixHeight, 100); };
    window.addEventListener("resize", onResize, { passive: true });
    return () => { window.removeEventListener("resize", onResize); clearTimeout(t); };
  }, []);

  const tabs = [
    { id: "home" as Tab, icon: Home,          label: ru ? "Сегодня"  : "Today"    },
    { id: "plan" as Tab, icon: Calendar,      label: ru ? "План"     : "Plan"     },
    { id: "ai"   as Tab, icon: Bot,           label: "AI"                          },
    { id: "more" as Tab, icon: MoreHorizontal, label: ru ? "Ещё"     : "More"     },
  ];

  return (
    <TelegramProvider>
      <>
        <style>{`
          * { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
          html, body { height:100%; overflow:hidden; position:fixed; width:100%; top:0; left:0; }
          #root { height:100%; overflow:hidden; }
          input, textarea, select { font-size:16px !important; }
          @keyframes bounce { 0%,100%{transform:translateY(0);opacity:.4} 50%{transform:translateY(-4px);opacity:1} }
          @keyframes pulse-dot { 0%,100%{opacity:.4;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
          textarea::placeholder, input::placeholder { color:rgba(255,255,255,.3); }
          ::-webkit-scrollbar { width:0; height:0; }
        `}</style>

        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: theme.bg,
            color: "white",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: "background-color 0.3s ease",
          }}
        >
          {/* Контент */}
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
                padding: "12px 16px 16px",
                maxWidth: "480px",
                margin: "0 auto",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              {/* WorkspaceBar — только на главной и плане */}
              {(tab === "home" || tab === "plan") && <WorkspaceBar />}

              {tab === "home" && <HomePage />}
              {tab === "plan" && <CalendarPage />}
              {tab === "ai"   && <AiHubPage />}
              {tab === "more" && <MorePage />}
            </div>
          </div>

          {/* AddBtn — только на Сегодня и Плане */}
          {(tab === "home" || tab === "plan") && <AddBtn />}

          {/* Нижняя навигация */}
          <nav
            style={{
              position: "fixed",
              bottom: 0, left: 0, right: 0,
              height: "68px",
              backgroundColor: theme.bgNav,
              borderTop: "1px solid rgba(255,255,255,0.07)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              zIndex: 100,
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
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "2px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "4px 16px",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <Icon
                      size={20}
                      color={active ? theme.primary : "rgba(255,255,255,0.35)"}
                      strokeWidth={active ? 2.5 : 1.8}
                    />
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: active ? 600 : 400,
                        color: active ? theme.primary : "rgba(255,255,255,0.35)",
                        transition: "color 0.2s",
                      }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </>
    </TelegramProvider>
  );
}
