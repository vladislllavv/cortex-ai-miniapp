import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, RotateCcw, Coffee, Brain, CheckCircle } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18nStore } from "@/lib/i18n";
import { getAccentGradient } from "@/lib/theme";

type Phase = "focus" | "short_break" | "long_break";

const PHASES: Record<Phase, { label: string; labelEn: string; minutes: number; color: string }> = {
  focus:       { label: "Фокус",        labelEn: "Focus",       minutes: 25, color: "#6366f1" },
  short_break: { label: "Короткий отдых", labelEn: "Short break", minutes: 5,  color: "#22c55e" },
  long_break:  { label: "Длинный отдых", labelEn: "Long break",  minutes: 15, color: "#06b6d4" },
};

interface Props { taskTitle?: string; onClose: () => void; }

export default function PomodoroTimer({ taskTitle, onClose }: Props) {
  const { theme } = useTheme();
  const language = useI18nStore((s) => s.language);
  const ru = language === "ru";

  const [phase,      setPhase]      = useState<Phase>("focus");
  const [seconds,    setSeconds]    = useState(PHASES.focus.minutes * 60);
  const [running,    setRunning]    = useState(false);
  const [sessions,   setSessions]   = useState(0); // completed focus sessions
  const [customMin,  setCustomMin]  = useState(25);
  const [showCustom, setShowCustom] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gradient = getAccentGradient(theme);

  const totalSeconds = showCustom ? customMin * 60 : PHASES[phase].minutes * 60;
  const progress = 1 - seconds / totalSeconds;
  const phaseColor = showCustom ? theme.primary : PHASES[phase].color;

  // SVG ring
  const R    = 80;
  const circ = 2 * Math.PI * R;
  const dash = circ * progress;

  const tick = useCallback(() => {
    setSeconds((s) => {
      if (s <= 1) {
        setRunning(false);
        // Auto-advance phase
        setPhase((p) => {
          if (p === "focus") {
            setSessions((n) => {
              const next = n + 1;
              // Every 4 sessions → long break
              return next;
            });
            setSessions((n) => n); // will be set above
          }
          return p;
        });
        // Play notification sound via vibration
        try { navigator.vibrate?.([200, 100, 200]); } catch {}
        // Browser notification
        if (Notification.permission === "granted") {
          const p = phase;
          new Notification("CortexAI ⚡", {
            body: ru
              ? (p === "focus" ? "Фокус завершён! Время отдохнуть." : "Отдых закончился — за работу!")
              : (p === "focus" ? "Focus done! Time for a break." : "Break over — back to work!"),
            icon: "/icons/icon-192.png",
          });
        }
        return 0;
      }
      return s - 1;
    });
  }, [phase, ru]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, tick]);

  const switchPhase = (p: Phase) => {
    setPhase(p); setRunning(false); setShowCustom(false);
    setSeconds(PHASES[p].minutes * 60);
  };

  const reset = () => {
    setRunning(false);
    setSeconds(showCustom ? customMin * 60 : PHASES[phase].minutes * 60);
  };

  const requestNotifPermission = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 600,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      {/* Header */}
      <div style={{ width: "100%", maxWidth: 340, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0, textTransform: "uppercase", letterSpacing: "0.8px" }}>
            {ru ? "Таймер фокуса" : "Focus timer"}
          </p>
          {taskTitle && <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: "2px 0 0 0", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskTitle}</p>}
        </div>
        <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <X size={18} color="rgba(255,255,255,0.7)" />
        </button>
      </div>

      {/* Phase tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32, background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 4, width: "100%", maxWidth: 340 }}>
        {(Object.keys(PHASES) as Phase[]).map((p) => (
          <button key={p} onClick={() => switchPhase(p)} style={{
            flex: 1, height: 32, borderRadius: 10, border: "none",
            background: phase === p && !showCustom ? PHASES[p].color : "transparent",
            color: phase === p && !showCustom ? "#fff" : "rgba(255,255,255,0.4)",
            fontSize: 11, fontWeight: phase === p && !showCustom ? 700 : 400,
            cursor: "pointer", fontFamily: "inherit",
            transition: "all 0.2s",
          }}>
            {ru ? PHASES[p].label : PHASES[p].labelEn}
          </button>
        ))}
      </div>

      {/* Ring timer */}
      <div style={{ position: "relative", marginBottom: 32 }}>
        <svg width={196} height={196} style={{ transform: "rotate(-90deg)" }}>
          {/* Background ring */}
          <circle cx={98} cy={98} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} />
          {/* Progress ring */}
          <circle cx={98} cy={98} r={R} fill="none" stroke={phaseColor} strokeWidth={8}
            strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
            style={{ transition: running ? "none" : "stroke-dasharray 0.3s ease" }} />
        </svg>
        {/* Center content */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <p style={{ fontSize: 44, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-2px", fontVariantNumeric: "tabular-nums" }}>
            {mm}:{ss}
          </p>
          <p style={{ fontSize: 12, color: phaseColor, margin: "4px 0 0 0", fontWeight: 600 }}>
            {showCustom ? (ru ? "Свой таймер" : "Custom") : (ru ? PHASES[phase].label : PHASES[phase].labelEn)}
          </p>
          {sessions > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {Array.from({ length: Math.min(sessions, 8) }).map((_, i) => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1" }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "center" }}>
        <button onClick={reset} style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <RotateCcw size={18} color="rgba(255,255,255,0.6)" />
        </button>
        <button onClick={() => { setRunning(!running); requestNotifPermission(); }} style={{
          width: 72, height: 72, borderRadius: "50%",
          background: running ? "rgba(255,255,255,0.12)" : phaseColor,
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: running ? "none" : `0 8px 24px ${phaseColor}50`,
          transition: "all 0.2s",
        }}>
          {running ? <Pause size={28} color="#fff" /> : <Play size={28} color="#fff" style={{ marginLeft: 4 }} />}
        </button>
        <button onClick={() => { setShowCustom(!showCustom); setRunning(false); setSeconds(customMin * 60); }} style={{ width: 48, height: 48, borderRadius: "50%", background: showCustom ? `${theme.primary}30` : "rgba(255,255,255,0.08)", border: `1px solid ${showCustom ? theme.primary : "rgba(255,255,255,0.1)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Brain size={18} color={showCustom ? theme.primary : "rgba(255,255,255,0.6)"} />
        </button>
      </div>

      {/* Custom timer */}
      {showCustom && (
        <div style={{ width: "100%", maxWidth: 340, background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: "16px", marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 10px 0" }}>{ru ? "Длительность (минуты)" : "Duration (minutes)"}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[5, 10, 15, 20, 25, 30, 45, 60].map((m) => (
              <button key={m} onClick={() => { setCustomMin(m); setSeconds(m * 60); }} style={{
                flex: 1, height: 32, borderRadius: 8, border: "none",
                background: customMin === m ? theme.primary : "rgba(255,255,255,0.08)",
                color: customMin === m ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 11, fontWeight: customMin === m ? 700 : 400, cursor: "pointer", fontFamily: "inherit",
              }}>{m}</button>
            ))}
          </div>
        </div>
      )}

      {/* Sessions counter */}
      {sessions > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(99,102,241,0.12)", borderRadius: 12, padding: "8px 16px" }}>
          <CheckCircle size={14} color="#6366f1" />
          <p style={{ fontSize: 13, color: "#a5b4fc", margin: 0 }}>
            {sessions} {ru ? (sessions === 1 ? "сессия завершена" : "сессий завершено") : (sessions === 1 ? "session done" : "sessions done")}
          </p>
        </div>
      )}
    </div>
  );
}
