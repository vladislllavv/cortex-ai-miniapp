import { useEffect } from "react";
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
import { useNavStore } from "@/lib/navStore";

export default function App() {
  const tab = useNavStore((s) => s.tab);
  const setTab = useNavStore((s) => s.setTab);
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
    { id: "home" as const, icon: Home,           label: ru ? "Сегодня" : "Today" },
    { id: "plan" as const, icon: Calendar,       label: ru ? "План"    : "Plan"  },
    { id: "ai"   as const, icon: Bot,            label: "AI"                      },
    { id: "more" as const, icon: MoreHorizontal, label: ru ? "Ещё"     : "More"  },
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
          <div
            style={{
              flex: 1,
              overflowY: tab === "ai" ? "hidden" : "auto",
              overflowX: "hidden",
              WebkitOverflowScrolling: "touch" as any,
              paddingBottom: tab === "ai" ? "0px" : "68px",
              minHeight: 0,
            }}
          >
            <div
              style={{
                padding: tab === "ai" ? "12px 16px 0" : "12px 16px 16px",
                maxWidth: "480px",
                margin: "0 auto",
                width: "100%",
                boxSizing: "border-box",
                height: tab === "ai" ? "100%" : "auto",
                display: tab === "ai" ? "flex" : "block",
                flexDirection: tab === "ai" ? "column" : undefined,
              }}
            >
              {(tab === "home" || tab === "plan") && <WorkspaceBar />}

              {tab === "home" && <HomePage />}
              {tab === "plan" && <CalendarPage />}
              {tab === "ai"   && <AiHubPage />}
              {tab === "more" && <MorePage />}
            </div>
          </div>

          {(tab === "home" || tab === "plan") && <AddBtn />}

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
