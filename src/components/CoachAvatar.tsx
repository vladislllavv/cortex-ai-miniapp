import { useEffect, useRef } from "react";

export type CoachState = "idle" | "listening" | "thinking" | "speaking";

interface CoachAvatarProps {
  state: CoachState;
  size?: number;
}

export default function CoachAvatar({ state, size = 90 }: CoachAvatarProps) {
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
          const mouthEl = svgRef.current?.querySelector(
            "#ghost-mouth"
          ) as SVGPathElement | null;
          if (mouthEl) {
            mouthEl.setAttribute(
              "d",
              getMouthPath(mouthFrameRef.current, state)
            );
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
        "#ghost-mouth"
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

  const bodyColor = getBodyColor(state);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {/* Пульсация */}
      {(state === "speaking" || state === "listening") && (
        <div
          style={{
            position: "absolute",
            inset: -8,
            borderRadius: "50% 50% 30% 30%",
            backgroundColor:
              state === "listening"
                ? "rgba(239,68,68,0.12)"
                : "rgba(59,130,246,0.12)",
            animation: "ghostPulse 1.5s ease-in-out infinite",
          }}
        />
      )}

      {/* Thinking кольцо */}
      {state === "thinking" && (
        <div
          style={{
            position: "absolute",
            inset: -5,
            borderRadius: "50% 50% 30% 30%",
            border: "2px solid transparent",
            borderTopColor: "#3b82f6",
            borderRightColor: "#3b82f6",
            animation: "ghostSpin 0.8s linear infinite",
          }}
        />
      )}

      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox="0 0 100 110"
        style={{
          display: "block",
          filter:
            state === "speaking"
              ? "drop-shadow(0 0 12px rgba(59,130,246,0.4))"
              : state === "listening"
              ? "drop-shadow(0 0 12px rgba(239,68,68,0.3))"
              : "drop-shadow(0 2px 8px rgba(0,0,0,0.3))",
          transition: "filter 0.3s ease",
          animation: state === "idle" ? "ghostFloat 3s ease-in-out infinite" : "none",
        }}
      >
        {/* Тело привидения */}
        <path
          d={`
            M 50 5
            C 20 5, 8 28, 8 50
            L 8 85
            Q 8 95, 18 90
            Q 28 85, 32 95
            Q 36 105, 42 95
            Q 48 85, 50 95
            Q 52 85, 58 95
            Q 64 105, 68 95
            Q 72 85, 82 90
            Q 92 95, 92 85
            L 92 50
            C 92 28, 80 5, 50 5
            Z
          `}
          fill={bodyColor}
          style={{ transition: "fill 0.4s ease" }}
        />

        {/* Блик на голове */}
        <ellipse
          cx="35"
          cy="25"
          rx="12"
          ry="8"
          fill="rgba(255,255,255,0.2)"
          transform="rotate(-15 35 25)"
        />

        {/* Левый глаз */}
        <g>
          {state === "thinking" ? (
            <>
              <ellipse cx="35" cy="45" rx="8" ry="9" fill="white" />
              <circle cx="34" cy="42" r="4" fill="#1e293b" />
              <circle cx="35" cy="40" r="1.5" fill="white" />
            </>
          ) : state === "listening" ? (
            <>
              <ellipse cx="35" cy="45" rx="9" ry="10" fill="white" />
              <circle cx="35" cy="45" r="4.5" fill="#1e293b" />
              <circle cx="36" cy="43" r="1.5" fill="white" />
            </>
          ) : (
            <>
              <ellipse cx="35" cy="45" rx="8" ry="9" fill="white" />
              <circle cx="36" cy="46" r="4" fill="#1e293b" />
              <circle cx="37" cy="44" r="1.5" fill="white" />
            </>
          )}
        </g>

        {/* Правый глаз */}
        <g>
          {state === "thinking" ? (
            <>
              <ellipse cx="65" cy="45" rx="8" ry="9" fill="white" />
              <circle cx="64" cy="42" r="4" fill="#1e293b" />
              <circle cx="65" cy="40" r="1.5" fill="white" />
            </>
          ) : state === "listening" ? (
            <>
              <ellipse cx="65" cy="45" rx="9" ry="10" fill="white" />
              <circle cx="65" cy="45" r="4.5" fill="#1e293b" />
              <circle cx="66" cy="43" r="1.5" fill="white" />
            </>
          ) : (
            <>
              <ellipse cx="65" cy="45" rx="8" ry="9" fill="white" />
              <circle cx="66" cy="46" r="4" fill="#1e293b" />
              <circle cx="67" cy="44" r="1.5" fill="white" />
            </>
          )}
        </g>

        {/* Брови при listening */}
        {state === "listening" && (
          <>
            <path
              d="M27 33 Q35 28 43 33"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M57 33 Q65 28 73 33"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </>
        )}

        {/* Рот */}
        <path
          id="ghost-mouth"
          d={getMouthPath(0, state)}
          fill={state === "speaking" || state === "listening" ? "#1e293b" : "none"}
          stroke={
            state === "idle" || state === "thinking"
              ? "rgba(255,255,255,0.6)"
              : "#1e293b"
          }
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Щёки при speaking */}
        {state === "speaking" && (
          <>
            <circle cx="22" cy="62" r="6" fill="rgba(255,180,180,0.3)" />
            <circle cx="78" cy="62" r="6" fill="rgba(255,180,180,0.3)" />
          </>
        )}

        {/* Волны звука */}
        {state === "speaking" && (
          <g opacity="0.6">
            <path
              d="M 88 42 Q 93 50 88 58"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M 93 37 Q 100 50 93 63"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}

        {/* Значок микрофона */}
        {state === "listening" && (
          <g>
            <circle cx="88" cy="42" r="8" fill="rgba(239,68,68,0.25)" />
            <path
              d="M88 38 L88 46 M85 41 Q85 45 88 45 Q91 45 91 41"
              stroke="rgba(239,68,68,0.9)"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>

      <style>{`
        @keyframes ghostPulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.12); opacity: 0.9; }
        }
        @keyframes ghostSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes ghostFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
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

function getMouthPath(frame: number, state: CoachState): string {
  if (state === "idle") {
    return "M 38 65 Q 50 74 62 65";
  }
  if (state === "thinking") {
    return "M 42 68 Q 50 66 58 70";
  }
  if (state === "listening" || state === "speaking") {
    const frames = [
      "M 40 64 Q 50 70 60 64 Q 50 60 40 64",
      "M 39 63 Q 50 75 61 63 Q 50 58 39 63",
      "M 38 62 Q 50 80 62 62 Q 50 56 38 62",
    ];
    return frames[frame] || frames[0];
  }
  return "M 38 65 Q 50 74 62 65";
}
