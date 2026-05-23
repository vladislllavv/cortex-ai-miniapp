import { useEffect } from "react";
import { Home, Calendar, Zap, MoreHorizontal } from "lucide-react";
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
  const tab    = useNavStore((s) => s.tab);
  const setTab = useNavStore((s) => s.setTab);
  const language = useI18nStore((s) => s.language);
  const ru = language === "ru";
  const { theme } = useTheme();

  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) { tg.ready(); tg.expand(); }
    } catch {}
    const fix = () => document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
    fix();
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(fix, 100); };
    window.addEventListener("resize", onResize, { passive: true });
    return () => { window.removeEventListener("resize", onResize); clearTimeout(t); };
  }, []);

  const tabs = [
    { id: "home" as const, icon: Home,          label: ru ? "Сегодня" : "Today" },
    { id: "plan" as const, icon: Calendar,      label: ru ? "Календарь" : "Calendar" },
    { id: "ai"   as const, icon: Zap,           label: "AI" },
    { id: "more" as const, icon: MoreHorizontal, label: ru ? "Ещё" : "More" },
  ];

  return (
    <TelegramProvider>
      <>
        <style>{`
          *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
          html, body { height:100%; overflow:hidden; position:fixed; width:100%; }
          #root { height:100%; }
          @keyframes dot-bounce { 0%,100%{transform:translateY(0);opacity:.4} 50%{transform:translateY(-5px);opacity:1} }
          @keyframes pulse-ring  { 0%,100%{opacity:.4;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
          @keyframes spin { to{transform:rotate(360deg)} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
          textarea::placeholder, input::placeholder { color: rgba(255,255,255,.3); }
        `}</style>

        <div style={{
          position: "fixed", inset: 0,
          background: theme.bg,
          color: "#fff",
          fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* ── Main scroll area ── */}
          <div style={{
            flex: 1, minHeight: 0,
            overflowY:  tab === "ai" ? "hidden" : "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch" as any,
            paddingBottom: tab === "ai" ? 0 : 76,
          }}>
            <div style={{
              padding: tab === "ai" ? "12px 16px 0" : "12px 16px 20px",
              maxWidth: 480, margin: "0 auto", width: "100%",
              height: tab === "ai" ? "100%" : "auto",
              display: tab === "ai" ? "flex" : "block",
              flexDirection: tab === "ai" ? "column" : undefined,
            }}>
              {(tab === "home" || tab === "plan") && <WorkspaceBar />}
              {tab === "home" && <HomePage />}
              {tab === "plan" && <CalendarPage />}
              {tab === "ai"   && <AiHubPage />}
              {tab === "more" && <MorePage />}
            </div>
          </div>

          {(tab === "home" || tab === "plan") && <AddBtn />}

          {/* ── Bottom Nav ── */}
          <nav style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            height: 68,
            background: "rgba(10,10,18,0.92)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            zIndex: 100,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-around", alignItems: "center",
              height: "100%", maxWidth: 480, margin: "0 auto",
              paddingBottom: "env(safe-area-inset-bottom,0px)",
            }}>
              {tabs.map(({ id, icon: Icon, label }) => {
                const active = tab === id;
                return (
                  <button key={id} onClick={() => setTab(id)} style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: 3, background: "none", border: "none", cursor: "pointer",
                    padding: "6px 18px", position: "relative",
                  }}>
                    {/* active indicator dot */}
                    {active && (
                      <div style={{
                        position: "absolute", top: 0, left: "50%",
                        transform: "translateX(-50%)",
                        width: 20, height: 2, borderRadius: 2,
                        background: theme.primary,
                      }} />
                    )}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: active ? `${theme.primary}20` : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.2s",
                    }}>
                      <Icon size={20} color={active ? theme.primary : "rgba(255,255,255,0.3)"} strokeWidth={active ? 2.5 : 1.8} />
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: active ? 700 : 400,
                      color: active ? theme.primary : "rgba(255,255,255,0.3)",
                      letterSpacing: active ? "0.3px" : 0,
                    }}>{label}</span>
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
