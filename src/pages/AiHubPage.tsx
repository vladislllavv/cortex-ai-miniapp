import { useState } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import AiProcessPage from "./AiProcessPage";
import CoachPage from "./CoachPage";

type AiTab = "assistant" | "coach";

export default function AiHubPage() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const [aiTab, setAiTab] = useState<AiTab>("assistant");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Сегмент-контрол */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          backgroundColor: "rgba(255,255,255,0.06)",
          borderRadius: "12px",
          padding: "3px",
          marginBottom: "10px",
          flexShrink: 0,
        }}
      >
        {(
          [
            { id: "assistant" as AiTab, label: ru ? "Ассистент" : "Assistant", emoji: "⚡" },
            { id: "coach"     as AiTab, label: ru ? "Коуч"      : "Coach",     emoji: "👻" },
          ]
        ).map(({ id, label, emoji }) => (
          <button
            key={id}
            onClick={() => setAiTab(id)}
            style={{
              flex: 1,
              height: "34px",
              borderRadius: "9px",
              border: "none",
              backgroundColor: aiTab === id ? theme.primary : "transparent",
              color: aiTab === id ? "white" : "rgba(255,255,255,0.5)",
              fontSize: "13px",
              fontWeight: aiTab === id ? 600 : 400,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "5px",
              transition: "all 0.2s",
            }}
          >
            <span>{emoji}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Контент — flex:1 чтобы занять оставшееся место */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {aiTab === "assistant" && <AiProcessPage embedded />}
        {aiTab === "coach"     && <CoachPage embedded />}
      </div>
    </div>
  );
}
