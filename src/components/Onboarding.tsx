import { useState } from "react";
import { Check, ChevronRight, Zap, Brain, Flame, Users, Search } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18nStore } from "@/lib/i18n";
import { getAccentGradient } from "@/lib/theme";

const ONBOARDING_KEY = "cortexai-onboarded-v1";

export function isOnboarded(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === "1"; } catch { return false; }
}
export function markOnboarded(): void {
  try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch {}
}

interface Step {
  emoji: string;
  title: string;
  titleEn: string;
  desc: string;
  descEn: string;
  color: string;
}

const STEPS: Step[] = [
  {
    emoji: "⚡",
    title: "Добро пожаловать в CortexAI",
    titleEn: "Welcome to CortexAI",
    desc: "Умный планировщик задач с AI-коучингом, трекером привычек и командной работой — всё в одном месте.",
    descEn: "Smart task planner with AI coaching, habit tracking, and team collaboration — all in one place.",
    color: "#6366f1",
  },
  {
    emoji: "📌",
    title: "Задачи, которые работают",
    titleEn: "Tasks that work for you",
    desc: "Добавляй задачи голосом или текстом. Устанавливай приоритеты, теги и дедлайны. AI сам расставит порядок.",
    descEn: "Add tasks by voice or text. Set priorities, tags and deadlines. AI will sort them for you.",
    color: "#3b82f6",
  },
  {
    emoji: "🔥",
    title: "Строй полезные привычки",
    titleEn: "Build healthy habits",
    desc: "Трекер привычек со streak-счётчиком. Один тап — отметил день. Следи за прогрессом за 7 дней.",
    descEn: "Habit tracker with streak counting. One tap to mark the day. Track 7-day progress.",
    color: "#f97316",
  },
  {
    emoji: "🤖",
    title: "AI всегда рядом",
    titleEn: "AI always with you",
    desc: "АИ Агент создаёт задачи из обычного текста. АИ Коуч помогает с мотивацией и целями. Голосовой ввод.",
    descEn: "AI Agent creates tasks from text. AI Coach helps with motivation and goals. Voice input included.",
    color: "#8b5cf6",
  },
  {
    emoji: "👥",
    title: "Работай в команде",
    titleEn: "Work with your team",
    desc: "Создавай рабочие пространства, приглашай коллег по коду и назначайте задачи друг другу.",
    descEn: "Create workspaces, invite teammates with a code, and assign tasks to each other.",
    color: "#f59e0b",
  },
];

interface Props { onDone: () => void; }

export default function Onboarding({ onDone }: Props) {
  const { theme } = useTheme();
  const language = useI18nStore((s) => s.language);
  const ru = language === "ru";
  const [step, setStep] = useState(0);
  const gradient = getAccentGradient(theme);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = () => {
    if (isLast) { markOnboarded(); onDone(); }
    else setStep((s) => s + 1);
  };

  const skip = () => { markOnboarded(); onDone(); };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900,
      background: "#08080f",
      display: "flex", flexDirection: "column",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
    }}>
      {/* Top gradient decoration */}
      <div style={{
        position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)",
        width: 400, height: 400, borderRadius: "50%",
        background: `radial-gradient(circle, ${current.color}25 0%, transparent 70%)`,
        pointerEvents: "none", transition: "background 0.5s",
      }} />

      {/* Skip */}
      <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={skip} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>
          {ru ? "Пропустить" : "Skip"}
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 32px" }}>
        {/* Big emoji */}
        <div style={{
          width: 100, height: 100, borderRadius: 28,
          background: `${current.color}20`, border: `2px solid ${current.color}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 52, marginBottom: 32,
          boxShadow: `0 8px 32px ${current.color}25`,
          transition: "all 0.4s",
        }}>
          {current.emoji}
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", textAlign: "center", margin: "0 0 14px 0", letterSpacing: "-0.5px", lineHeight: 1.2 }}>
          {ru ? current.title : current.titleEn}
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", textAlign: "center", margin: 0, lineHeight: 1.6, maxWidth: 300 }}>
          {ru ? current.desc : current.descEn}
        </p>

        {/* Feature pills for step 0 */}
        {step === 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24, justifyContent: "center" }}>
            {[
              { icon: "📌", label: ru ? "Задачи" : "Tasks" },
              { icon: "🔥", label: ru ? "Привычки" : "Habits" },
              { icon: "🤖", label: "AI" },
              { icon: "👥", label: ru ? "Команда" : "Team" },
              { icon: "🔍", label: ru ? "Поиск" : "Search" },
              { icon: "⏱", label: "Pomodoro" },
            ].map((f) => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span style={{ fontSize: 14 }}>{f.icon}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{f.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom */}
      <div style={{ padding: "0 24px 40px" }}>
        {/* Dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} style={{
              width: i === step ? 20 : 6, height: 6, borderRadius: 3,
              background: i === step ? current.color : "rgba(255,255,255,0.15)",
              border: "none", cursor: "pointer",
              transition: "all 0.3s",
            }} />
          ))}
        </div>

        {/* CTA button */}
        <button onClick={next} style={{
          width: "100%", height: 54, borderRadius: 16, border: "none",
          background: gradient,
          color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          fontFamily: "inherit",
          boxShadow: `0 8px 24px ${current.color}35`,
          transition: "all 0.2s",
        }}>
          {isLast
            ? (ru ? "Начать использовать ✨" : "Get started ✨")
            : (ru ? "Далее" : "Next")}
          {!isLast && <ChevronRight size={20} />}
        </button>
      </div>
    </div>
  );
}
