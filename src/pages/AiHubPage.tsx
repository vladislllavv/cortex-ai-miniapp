import { useState } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import AiProcessPage from "./AiProcessPage";
import CoachPage from "./CoachPage";
import { Zap, Brain } from "lucide-react";

type AiTab = "assistant" | "coach";

export default function AiHubPage() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const [aiTab, setAiTab] = useState<AiTab>("assistant");

  const tabs = [
    { id: "assistant" as AiTab, label: ru ? "АИ Агент" : "AI Agent", Icon: Zap },
    { id: "coach"     as AiTab, label: ru ? "АИ Коуч"  : "AI Coach",  Icon: Brain },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>

      {/* Segment control */}
      <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 4, marginBottom: 12, flexShrink: 0 }}>
        {tabs.map(({ id, label, Icon }) => {
          const active = aiTab === id;
          return (
            <button key={id} onClick={() => setAiTab(id)} style={{
              flex: 1, height: 38, borderRadius: 10, border: "none",
              background: active ? theme.primary : "transparent",
              color: active ? "#fff" : "rgba(255,255,255,0.4)",
              fontSize: 13, fontWeight: active ? 700 : 400,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 6,
              transition: "all 0.2s",
              boxShadow: active ? `0 4px 12px ${theme.primary}40` : "none",
            }}>
              <Icon size={15} strokeWidth={active ? 2.5 : 2} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {aiTab === "assistant" && <AiProcessPage embedded />}
        {aiTab === "coach"     && <CoachPage embedded />}
      </div>
    </div>
  );
}
