import { useEffect, useRef } from "react";

export type CoachState = "idle" | "listening" | "thinking" | "speaking";

interface CoachAvatarProps {
  state: CoachState;
  size?: number;
}

export default function CoachAvatar({ state, size = 80 }: CoachAvatarProps) {
  const mouthFrameRef = useRef(0);
  const animRef = useRef<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (state === "speaking" || state === "listening") {
      let lastTime = 0;
      const interval = state === "listening" ? 300 : 120;

      const animate = (time: number) => {
        if (time - lastTime >= interval) {
          mouthFrameRef.current = (mouthFrameRef.current + 1) % 3;
          lastTime = time;

          // Обновляем рот напрямую через DOM без ре-рендера
          const mouthEl = svgRef.current?.querySelector(
            "#coach-mouth"
          ) as SVGPathElement | null;
          if (mouthEl) {
            mouthEl.setAttribute("d", getMouthPath(mouthFrameRef.current, state));
          }
        }
        animRef.current = requestAnimationFrame(animate);
      };

      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      mouthFrameRef.current = 0;
      const mouthEl = svgRef.current?.querySelector(
        "#coach-mouth"
      ) as SVGPathElement | null;
      if (mouthEl) {
        mouthEl.setAttribute("d", getMouthPath(0, state));
      }
    }

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    };
  }, [state]);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {/* Пульсирующий ореол */}
      {(state === "speaking" || state === "listening") && (
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            backgroundColor:
              state === "listening"
                ? "rgba(239,68,68,0.15)"
                : "rgba(59,130,246,0.15)",
            animation: "coachPulse 1.2s ease-in-out infinite",
          }}
        />
      )}

      {/* Thinking кольцо */}
      {state === "thinking" && (
        <div
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            border: "2px solid transparent",
            borderTopColor: "#3b82f6",
            borderRightColor: "#3b82f6",
            animation: "coachSpin 0.8s linear infinite",
          }}
        />
      )}

      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ display: "block" }}
      >
        {/* Фон пузыря */}
        <circle
          cx="50"
          cy="50"
          r="48"
          fill={getBodyColor(state)}
          style={{ transition: "fill 0.3s ease" }}
        />

        {/* Блик */}
        <ellipse
          cx="36"
          cy="30"
          rx="10"
          ry="7"
          fill="rgba(255,255,255,0.25)"
          transform="rotate(-20 36 30)"
        />

        {/* Глаза */}
        <g>
          {state === "thinking" ? (
            // Глаза «думает» — смотрит вверх
            <>
              <circle cx="35" cy="42" r="6" fill="white" />
              <circle cx="65" cy="42" r="6" fill="white" />
              <circle cx="35" cy="40" r="3" fill="#1e293b" />
              <circle cx="65" cy="40" r="3" fill="#1e293b" />
            </>
          ) : state === "listening" ? (
            // Глаза «слушает» — чуть шире
            <>
              <circle cx="35" cy="43" r="7" fill="white" />
              <circle cx="65" cy="43" r="7" fill="white" />
              <circle cx="35" cy="43" r="3.5" fill="#1e293b" />
              <circle cx="65" cy="43" r="3.5" fill="#1e293b" />
              {/* Бровь-внимание */}
              <path
                d="M29 34 Q35 31 41 34"
                stroke="#1e293b"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
              <path
                d="M59 34 Q65 31 71 34"
                stroke="#1e293b"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />
            </>
          ) : (
            // Обычные глаза
            <>
              <circle cx="35" cy="43" r="6" fill="white" />
              <circle cx="65" cy="43" r="6" fill="white" />
              <circle cx="36" cy="44" r="3" fill="#1e293b" />
              <circle cx="66" cy="44" r="3" fill="#1e293b" />
            </>
          )}

          {/* Блики в глазах */}
          <circle cx="37" cy="41" r="1.2" fill="white" />
          <circle cx="67" cy="41" r="1.2" fill="white" />
        </g>

        {/* Рот — анимируемый */}
        <path
          id="coach-mouth"
          d={getMouthPath(0, state)}
          fill={getMouthFill(state)}
          stroke={state === "speaking" || state === "listening" ? "#1e293b" : "none"}
          strokeWidth="1.5"
          strokeLinecap="round"
          style={{ transition: state === "idle" ? "d 0.3s ease" : "none" }}
        />

        {/* Щёки при speaking */}
        {state === "speaking" && (
          <>
            <circle cx="22" cy="58" r="8" fill="rgba(255,150,150,0.25)" />
            <circle cx="78" cy="58" r="8" fill="rgba(255,150,150,0.25)" />
          </>
        )}

        {/* Волны звука при speaking */}
        {state === "speaking" && (
          <>
            <path
              d="M 82 45 Q 88 50 82 55"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M 87 40 Q 96 50 87 60"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Микрофон при listening */}
        {state === "listening" && (
          <>
            <circle cx="82" cy="45" r="6" fill="rgba(239,68,68,0.3)" />
            <path
              d="M82 42 L82 48 M80 44 Q80 47 82 47 Q84 47 84 44"
              stroke="rgba(239,68,68,0.8)"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>

      <style>{`
        @keyframes coachPulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
        }
        @keyframes coachSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function getBodyColor(state: CoachState): string {
  switch (state) {
    case "listening": return "#ef4444";
    case "thinking":  return "#6366f1";
    case "speaking":  return "#3b82f6";
    default:          return "#2563eb";
  }
}

function getMouthFill(state: CoachState): string {
  if (state === "speaking" || state === "listening") return "#1e293b";
  return "none";
}

// Три кадра рта для анимации
function getMouthPath(frame: number, state: CoachState): string {
  if (state === "idle") {
    // Улыбка
    return "M 35 62 Q 50 72 65 62";
  }
  if (state === "thinking") {
    // Чуть скошенный рот
    return "M 38 65 Q 50 63 62 67";
  }
  if (state === "listening" || state === "speaking") {
    // Три кадра открытого рта
    const frames = [
      "M 38 62 Q 50 68 62 62 Q 50 58 38 62",     // закрыт
      "M 37 61 Q 50 72 63 61 Q 50 56 37 61",     // средне открыт
      "M 36 60 Q 50 76 64 60 Q 50 54 36 60",     // широко открыт
    ];
    return frames[frame] || frames[0];
  }
  return "M 35 62 Q 50 72 65 62";
}
