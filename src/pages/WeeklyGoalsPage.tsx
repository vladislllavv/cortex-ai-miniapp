import { useState, useEffect } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTaskStore, getSafeUserId } from "@/lib/store";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, setDoc, collection,
  getDocs, deleteDoc,
} from "firebase/firestore";
import { Edit2, Trash2, Plus, Check, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface WeeklyGoal {
  id: string;
  text: string;
  completed: boolean;
  weekStart: string;
  createdAt: string;
  category?: string;
  dueDate?: string;
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

export default function WeeklyGoalsPage() {
  const language = useI18nStore((state) => state.language);
  const addTask = useTaskStore((state) => state.addTask);
  const { theme } = useTheme();
  const ru = language === "ru";
  const userId = getSafeUserId();

  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newGoalText, setNewGoalText] = useState("");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [loading, setLoading] = useState(true);

  const weekStart = getWeekStart();
  const currentWeekGoals = goals.filter((g) => g.weekStart === weekStart);
  const completedCount = currentWeekGoals.filter((g) => g.completed).length;

  useEffect(() => {
    
    const load = async () => {
      setLoading(true);
      try {
        const goalsSnap = await getDocs(
          collection(db, "users", userId, "weeklyGoals")
        );
        const loadedGoals: WeeklyGoal[] = [];
        goalsSnap.forEach((d) => loadedGoals.push(d.data() as WeeklyGoal));
        setGoals(
          loadedGoals.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
      } catch {}
      setLoading(false);
    };
    load();
  }, [userId]);

  const toggleGoal = async (id: string) => {
    const updated = goals.map((g) =>
      g.id === id ? { ...g, completed: !g.completed } : g
    );
    setGoals(updated);
    if (userId) {
      const goal = updated.find((g) => g.id === id);
      if (goal)
        await setDoc(
          doc(db, "users", userId, "weeklyGoals", id),
          goal
        ).catch(() => {});
    }
  };

  const addManualGoal = async () => {
    if (!newGoalText.trim()) return;
    const goalId = `goal_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 6)}`;
    const newGoal: WeeklyGoal = {
      id: goalId,
      text: newGoalText.trim(),
      completed: false,
      weekStart,
      createdAt: new Date().toISOString(),
    };

    setGoals((prev) => [newGoal, ...prev]);
    setNewGoalText("");
    setShowAddGoal(false);

    if (userId) {
      await setDoc(
        doc(db, "users", userId, "weeklyGoals", goalId),
        newGoal
      ).catch(() => {});

      await addTask({
        title: `🎯 ${newGoal.text}`,
        priority: "medium",
        status: "todo",
        isAiCreated: false,
        repeat: "none",
        type: "task",
        description: ru ? "Цель недели" : "Weekly goal",
        items: [],
      });
    }
  };

  const deleteGoal = async (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    if (userId) {
      await deleteDoc(
        doc(db, "users", userId, "weeklyGoals", id)
      ).catch(() => {});
    }
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    const updated = goals.map((g) =>
      g.id === id ? { ...g, text: editText.trim() } : g
    );
    setGoals(updated);
    setEditingGoal(null);
    if (userId) {
      const goal = updated.find((g) => g.id === id);
      if (goal)
        await setDoc(
          doc(db, "users", userId, "weeklyGoals", id),
          goal
        ).catch(() => {});
    }
  };

  if (loading) {
    return (
      <div style={{ paddingTop: "40px", textAlign: "center" }}>
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: theme.primary,
            animation: "pulse-dot 1s ease-in-out infinite",
            margin: "0 auto 12px",
          }}
        />
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>
          {ru ? "Загрузка..." : "Loading..."}
        </p>
        <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 0.4; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "20px" }}>

      {/* Заголовок */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "white",
              margin: 0,
            }}
          >
            🎯 {ru ? "Цели на неделю" : "Weekly Goals"}
          </p>
          <p
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.4)",
              margin: 0,
            }}
          >
            {ru ? `Неделя с ${weekStart}` : `Week from ${weekStart}`}
          </p>
        </div>
      </div>

      {/* Прогресс */}
      {currentWeekGoals.length > 0 && (
        <div
          style={{
            backgroundColor: `${theme.primary}12`,
            border: `1px solid ${theme.primary}25`,
            borderRadius: "14px",
            padding: "14px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <p
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.7)",
                margin: 0,
              }}
            >
              {ru ? "Прогресс недели" : "Week progress"}
            </p>
            <p
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: theme.primary,
                margin: 0,
              }}
            >
              {completedCount}/{currentWeekGoals.length}
            </p>
          </div>
          <div
            style={{
              height: "6px",
              backgroundColor: "rgba(255,255,255,0.1)",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${
                  currentWeekGoals.length > 0
                    ? (completedCount / currentWeekGoals.length) * 100
                    : 0
                }%`,
                backgroundColor: theme.primary,
                borderRadius: "3px",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          {completedCount === currentWeekGoals.length &&
            currentWeekGoals.length > 0 && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#22c55e",
                  margin: "6px 0 0 0",
                }}
              >
                🎉 {ru ? "Все цели выполнены!" : "All goals completed!"}
              </p>
            )}
        </div>
      )}

      {/* Кнопка добавить */}
      <button
        onClick={() => setShowAddGoal(true)}
        style={{
          width: "100%",
          height: "44px",
          borderRadius: "12px",
          border: `1px dashed ${theme.primary}60`,
          backgroundColor: `${theme.primary}08`,
          fontSize: "14px",
          color: theme.primary,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          marginBottom: "12px",
        }}
      >
        <Plus size={16} /> {ru ? "Добавить цель" : "Add goal"}
      </button>

      {/* Форма добавления */}
      {showAddGoal && (
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            padding: "12px",
            marginBottom: "12px",
          }}
        >
          <input
            autoFocus
            value={newGoalText}
            onChange={(e) => setNewGoalText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManualGoal()}
            placeholder={
              ru ? "Напиши цель на эту неделю..." : "Write a goal..."
            }
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box" as const,
              height: "42px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor: "rgba(255,255,255,0.07)",
              paddingLeft: "12px",
              paddingRight: "12px",
              fontSize: "14px",
              color: "white",
              outline: "none",
              marginBottom: "8px",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setShowAddGoal(false)}
              style={{
                flex: 1,
                height: "36px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "transparent",
                color: "rgba(255,255,255,0.5)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {ru ? "Отмена" : "Cancel"}
            </button>
            <button
              onClick={addManualGoal}
              disabled={!newGoalText.trim()}
              style={{
                flex: 1,
                height: "36px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: newGoalText.trim()
                  ? theme.primary
                  : "rgba(255,255,255,0.1)",
                color: "white",
                fontSize: "13px",
                fontWeight: 600,
                cursor: newGoalText.trim() ? "pointer" : "default",
              }}
            >
              {ru ? "Добавить" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Список целей */}
      {currentWeekGoals.length === 0 && !showAddGoal ? (
        <div
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "14px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "32px", margin: "0 0 8px 0" }}>🎯</p>
          <p
            style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.5)",
              margin: "0 0 4px 0",
              fontWeight: 600,
            }}
          >
            {ru ? "Нет целей на эту неделю" : "No goals this week"}
          </p>
          <p
            style={{
              fontSize: "12px",
              color: "rgba(255,255,255,0.3)",
              margin: 0,
            }}
          >
            {ru ? "Добавь сам или попроси AI коуча" : "Add manually or ask AI coach"}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {currentWeekGoals.map((goal) => (
            <div
              key={goal.id}
              style={{
                backgroundColor: "rgba(255,255,255,0.05)",
                border: goal.completed
                  ? "1px solid rgba(34,197,94,0.2)"
                  : "1px solid rgba(255,255,255,0.07)",
                borderRadius: "14px",
                padding: "12px 14px",
                opacity: goal.completed ? 0.7 : 1,
                transition: "all 0.2s",
              }}
            >
              {editingGoal === goal.id ? (
                <div
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                >
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(goal.id)}
                    style={{
                      flex: 1,
                      height: "36px",
                      borderRadius: "8px",
                      border: `1px solid ${theme.primary}60`,
                      backgroundColor: "rgba(255,255,255,0.07)",
                      paddingLeft: "10px",
                      paddingRight: "10px",
                      fontSize: "14px",
                      color: "white",
                      outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={() => saveEdit(goal.id)}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: theme.primary,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Check size={14} color="white" />
                  </button>
                  <button
                    onClick={() => setEditingGoal(null)}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.1)",
                      backgroundColor: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <X size={14} color="rgba(255,255,255,0.5)" />
                  </button>
                </div>
              ) : (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <button
                    onClick={() => toggleGoal(goal.id)}
                    style={{
                      width: "22px",
                      height: "22px",
                      minWidth: "22px",
                      borderRadius: "50%",
                      border: `2px solid ${
                        goal.completed ? "#22c55e" : "rgba(255,255,255,0.25)"
                      }`,
                      backgroundColor: goal.completed
                        ? "#22c55e"
                        : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      padding: 0,
                      flexShrink: 0,
                      transition: "all 0.2s",
                    }}
                  >
                    {goal.completed && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6L5 9L10 3"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: goal.completed
                          ? "rgba(255,255,255,0.4)"
                          : "rgba(255,255,255,0.9)",
                        textDecoration: goal.completed ? "line-through" : "none",
                        margin: 0,
                        wordBreak: "break-word",
                        lineHeight: "1.4",
                      }}
                    >
                      {goal.text}
                      {goal.category === "ai" && (
                        <span
                          style={{
                            fontSize: "10px",
                            color: theme.primary,
                            marginLeft: "6px",
                            backgroundColor: `${theme.primary}20`,
                            padding: "1px 5px",
                            borderRadius: "6px",
                          }}
                        >
                          AI
                        </span>
                      )}
                    </p>
                    {goal.dueDate && (
                      <p
                        style={{
                          fontSize: "11px",
                          color: "rgba(255,255,255,0.35)",
                          margin: "2px 0 0 0",
                        }}
                      >
                        ⏰{" "}
                        {new Date(goal.dueDate).toLocaleString(
                          ru ? "ru-RU" : "en-US",
                          {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        setEditingGoal(goal.id);
                        setEditText(goal.text);
                      }}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: "rgba(255,255,255,0.06)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Edit2 size={12} color="rgba(255,255,255,0.4)" />
                    </button>
                    <button
                      onClick={() => deleteGoal(goal.id)}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "8px",
                        border: "none",
                        backgroundColor: "rgba(239,68,68,0.08)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trash2 size={12} color="#ef4444" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
