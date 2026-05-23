import { useState, useEffect } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTheme } from "@/contexts/ThemeContext";
import { useHabitsStore, Habit, getTodayStr } from "@/lib/habitsStore";
import { getTelegramUserId } from "@/lib/store";
import { Plus, Flame, Trophy, X, Check, Archive } from "lucide-react";
import { getAccentGradient } from "@/lib/theme";

const PRESET_HABITS = [
  { emoji: "💧", name: "Вода 8 стаканов", nameEn: "Drink 8 glasses", color: "#06b6d4" },
  { emoji: "🏃", name: "Зарядка", nameEn: "Exercise",           color: "#22c55e" },
  { emoji: "📚", name: "Чтение 20 мин",   nameEn: "Read 20 min", color: "#f59e0b" },
  { emoji: "🧘", name: "Медитация",       nameEn: "Meditation",  color: "#a855f7" },
  { emoji: "😴", name: "Сон до 23:00",    nameEn: "Sleep by 11", color: "#6366f1" },
  { emoji: "🥗", name: "Здоровая еда",    nameEn: "Eat healthy", color: "#22c55e" },
];

const COLORS = ["#3b82f6","#22c55e","#f59e0b","#ef4444","#a855f7","#06b6d4","#f97316","#ec4899"];
const EMOJIS = ["💧","🏃","📚","🧘","😴","🥗","💪","🎯","✍️","🎵","🌿","🏋️","🤸","🚶","🎨"];

export default function HabitsPage() {
  const language = useI18nStore((s) => s.language);
  const { theme } = useTheme();
  const ru = language === "ru";
  const userId = getTelegramUserId();
  const safeId = userId !== "unknown" ? userId : (localStorage.getItem("cortex-anon-uid") || userId);

  const { habits, subscribe, toggleToday, addHabit, deleteHabit, archiveHabit } = useHabitsStore();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("💪");
  const [color, setColor] = useState("#3b82f6");
  const [freq, setFreq] = useState<Habit["frequency"]>("daily");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (safeId) subscribe(safeId);
  }, [safeId]);

  const today = getTodayStr();
  const gradient = getAccentGradient(theme);

  const totalStreak = habits.reduce((s, h) => s + h.streak, 0);
  const todayDone = habits.filter((h) => (h.completedDates || []).includes(today)).length;

  const handleAdd = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    await addHabit(safeId, { name: name.trim(), emoji, color, frequency: freq });
    setSaving(false);
    setShowAdd(false);
    setName(""); setEmoji("💪"); setColor("#3b82f6"); setFreq("daily");
  };

  const usePreset = (p: typeof PRESET_HABITS[0]) => {
    setName(ru ? p.name : p.nameEn);
    setEmoji(p.emoji);
    setColor(p.color);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "0 0 2px 0", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          {ru ? "Трекер привычек" : "Habit Tracker"}
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.5px" }}>
          {ru ? "Привычки" : "Habits"}
        </h2>
      </div>

      {/* Summary */}
      {habits.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div style={{ background: gradient, borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Flame size={14} color="rgba(255,255,255,0.8)" />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {ru ? "Общий streak" : "Total streak"}
              </span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-1px" }}>{totalStreak}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: 0 }}>{ru ? "дней подряд" : "days total"}</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Check size={14} color="#22c55e" />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {ru ? "Сегодня" : "Today"}
              </span>
            </div>
            <p style={{ fontSize: 28, fontWeight: 800, color: todayDone === habits.length && habits.length > 0 ? "#22c55e" : "#fff", margin: 0, letterSpacing: "-1px" }}>
              {todayDone}/{habits.length}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? "выполнено" : "completed"}</p>
          </div>
        </div>
      )}

      {/* Habits list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {habits.map((habit) => {
          const done = (habit.completedDates || []).includes(today);
          const last7 = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (6 - i));
            return (habit.completedDates || []).includes(d.toISOString().split("T")[0]);
          });

          return (
            <div key={habit.id} style={{
              background: done ? `${habit.color}14` : "rgba(255,255,255,0.04)",
              border: `1px solid ${done ? habit.color + "35" : "rgba(255,255,255,0.07)"}`,
              borderRadius: 18, padding: "14px 16px",
              transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {/* Toggle */}
                <button onClick={() => toggleToday(safeId, habit.id)} style={{
                  width: 48, height: 48, minWidth: 48, borderRadius: 14,
                  background: done ? habit.color : "rgba(255,255,255,0.07)",
                  border: `2px solid ${done ? habit.color : "rgba(255,255,255,0.12)"}`,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, transition: "all 0.2s",
                  boxShadow: done ? `0 4px 12px ${habit.color}40` : "none",
                }}>
                  {done ? <Check size={20} color="#fff" strokeWidth={3} /> : habit.emoji}
                </button>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: done ? "rgba(255,255,255,0.6)" : "#fff", margin: 0, textDecoration: done ? "line-through" : "none" }}>
                      {habit.name}
                    </p>
                    {habit.streak > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 3, background: `${habit.color}20`, borderRadius: 8, padding: "2px 7px" }}>
                        <Flame size={10} color={habit.color} />
                        <span style={{ fontSize: 11, color: habit.color, fontWeight: 700 }}>{habit.streak}</span>
                      </div>
                    )}
                  </div>
                  {/* 7-day dots */}
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    {last7.map((d, i) => (
                      <div key={i} style={{
                        width: i === 6 ? 10 : 7, height: i === 6 ? 10 : 7,
                        borderRadius: "50%",
                        background: d ? habit.color : "rgba(255,255,255,0.1)",
                        border: i === 6 ? `2px solid ${habit.color}60` : "none",
                        transition: "background 0.2s",
                      }} />
                    ))}
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginLeft: 4, alignSelf: "center" }}>7{ru ? "д" : "d"}</span>
                  </div>
                </div>

                {/* Best streak */}
                {habit.bestStreak > 1 && (
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <Trophy size={12} color="#f59e0b" />
                    <p style={{ fontSize: 11, color: "#f59e0b", margin: "2px 0 0 0", fontWeight: 700 }}>{habit.bestStreak}</p>
                  </div>
                )}

                {/* Delete */}
                <button onClick={() => archiveHabit(safeId, habit.id)} style={{
                  width: 28, height: 28, borderRadius: 8, border: "none",
                  background: "rgba(255,255,255,0.05)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <X size={13} color="rgba(255,255,255,0.3)" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {habits.length === 0 && !showAdd && (
        <div style={{ textAlign: "center", padding: "30px 20px", background: "rgba(255,255,255,0.03)", borderRadius: 18, border: "1px dashed rgba(255,255,255,0.08)", marginBottom: 16 }}>
          <p style={{ fontSize: 36, margin: "0 0 8px 0" }}>🌱</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 4px 0" }}>{ru ? "Нет привычек" : "No habits yet"}</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {ru ? "Добавь первую привычку и начни строить streak" : "Add your first habit and start building streaks"}
          </p>
        </div>
      )}

      {/* Add button */}
      {!showAdd && (
        <button onClick={() => setShowAdd(true)} style={{
          width: "100%", height: 48, borderRadius: 14,
          border: `1px dashed ${theme.primary}50`, background: `${theme.primary}0a`,
          color: theme.primary, fontSize: 14, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit",
        }}>
          <Plus size={18} />{ru ? "Добавить привычку" : "Add habit"}
        </button>
      )}

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>{ru ? "Новая привычка" : "New habit"}</p>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              <X size={18} color="rgba(255,255,255,0.4)" />
            </button>
          </div>

          {/* Presets */}
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {ru ? "Быстрый выбор" : "Quick pick"}
          </p>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 2 }}>
            {PRESET_HABITS.map((p) => (
              <button key={p.name} onClick={() => usePreset(p)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20,
                border: `1px solid ${p.color}40`, background: `${p.color}10`,
                color: p.color, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit",
              }}>
                {p.emoji} {ru ? p.name : p.nameEn}
              </button>
            ))}
          </div>

          {/* Emoji picker */}
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "0 0 6px 0" }}>{ru ? "Иконка" : "Icon"}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} style={{
                width: 36, height: 36, borderRadius: 10, fontSize: 18,
                border: emoji === e ? `2px solid ${theme.primary}` : "2px solid transparent",
                background: emoji === e ? `${theme.primary}20` : "rgba(255,255,255,0.06)",
                cursor: "pointer",
              }}>{e}</button>
            ))}
          </div>

          {/* Name */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={ru ? "Название привычки..." : "Habit name..."}
            style={{ width: "100%", height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.07)", color: "#fff", padding: "0 14px", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 }}
          />

          {/* Color */}
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "0 0 6px 0" }}>{ru ? "Цвет" : "Color"}</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 28, height: 28, borderRadius: "50%", background: c,
                border: color === c ? "3px solid white" : "2px solid transparent",
                cursor: "pointer", boxShadow: color === c ? `0 0 8px ${c}` : "none",
              }} />
            ))}
          </div>

          {/* Frequency */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["daily", "weekdays", "weekends"] as const).map((f) => (
              <button key={f} onClick={() => setFreq(f)} style={{
                flex: 1, height: 36, borderRadius: 10, border: "none",
                background: freq === f ? theme.primary : "rgba(255,255,255,0.07)",
                color: freq === f ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 11, fontWeight: freq === f ? 600 : 400, cursor: "pointer", fontFamily: "inherit",
              }}>
                {f === "daily" ? (ru ? "Каждый день" : "Daily") : f === "weekdays" ? (ru ? "Пн–Пт" : "Mon–Fri") : (ru ? "Сб–Вс" : "Sat–Sun")}
              </button>
            ))}
          </div>

          <button onClick={handleAdd} disabled={!name.trim() || saving} style={{
            width: "100%", height: 46, borderRadius: 14, border: "none",
            background: name.trim() ? theme.primary : "rgba(255,255,255,0.1)",
            color: "#fff", fontSize: 15, fontWeight: 700, cursor: name.trim() ? "pointer" : "default", fontFamily: "inherit",
          }}>
            {saving ? "..." : (ru ? "Создать привычку" : "Create habit")}
          </button>
        </div>
      )}
    </div>
  );
}
