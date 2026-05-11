import { useState, useEffect, useRef } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTaskStore, getTelegramUserId } from "@/lib/store";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, setDoc, collection, getDocs, deleteDoc, addDoc
} from "firebase/firestore";
import { Send, Bot, Edit2, Trash2, Plus, Check, X } from "lucide-react";

const AI_WORKER_URL = "https://ancient-river-8a20.bubo-buboff.workers.dev";

interface WeeklyGoal {
  id: string;
  text: string;
  completed: boolean;
  weekStart: string;
  createdAt: string;
  category?: string;
}

interface UserProfile {
  weight?: string;
  height?: string;
  age?: string;
  fitnessLevel?: string;
  goals?: string;
  notes?: string;
}

async function saveGoalsToFirebase(userId: string, goals: WeeklyGoal[]) {
  if (userId === "unknown") return;
  try {
    for (const goal of goals) {
      await setDoc(doc(db, "users", userId, "weeklyGoals", goal.id), goal);
    }
  } catch {}
}

async function loadGoalsFromFirebase(userId: string): Promise<WeeklyGoal[]> {
  if (userId === "unknown") return [];
  try {
    const snap = await getDocs(collection(db, "users", userId, "weeklyGoals"));
    const goals: WeeklyGoal[] = [];
    snap.forEach((d) => goals.push(d.data() as WeeklyGoal));
    return goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch { return []; }
}

async function loadProfile(userId: string): Promise<UserProfile> {
  if (userId === "unknown") return {};
  try {
    const snap = await getDoc(doc(db, "users", userId, "settings", "profile"));
    if (snap.exists()) return snap.data() as UserProfile;
  } catch {}
  return {};
}

async function saveProfile(userId: string, profile: UserProfile) {
  if (userId === "unknown") return;
  try {
    await setDoc(doc(db, "users", userId, "settings", "profile"), profile);
  } catch {}
}

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split("T")[0];
}

export default function WeeklyGoalsPage() {
  const language = useI18nStore((state) => state.language);
  const tasks = useTaskStore((state) => state.tasks);
  const ru = language === "ru";
  const userId = getTelegramUserId();

  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [profile, setProfile] = useState<UserProfile>({});
  const [showProfile, setShowProfile] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: string; content: string }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newGoalText, setNewGoalText] = useState("");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const weekStart = getWeekStart();
  const currentWeekGoals = goals.filter((g) => g.weekStart === weekStart);
  const completedCount = currentWeekGoals.filter((g) => g.completed).length;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [loadedGoals, loadedProfile] = await Promise.all([
        loadGoalsFromFirebase(userId),
        loadProfile(userId),
      ]);
      setGoals(loadedGoals);
      setProfile(loadedProfile);
      setLoading(false);
    };
    load();
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const toggleGoal = async (id: string) => {
    const updated = goals.map((g) =>
      g.id === id ? { ...g, completed: !g.completed } : g
    );
    setGoals(updated);
    if (userId !== "unknown") {
      const goal = updated.find((g) => g.id === id);
      if (goal) {
        await setDoc(doc(db, "users", userId, "weeklyGoals", id), goal).catch(() => {});
      }
    }
  };

  const addGoal = async () => {
    if (!newGoalText.trim()) return;
    const newGoal: WeeklyGoal = {
      id: `goal_${Date.now()}`,
      text: newGoalText.trim(),
      completed: false,
      weekStart,
      createdAt: new Date().toISOString(),
    };
    const updated = [newGoal, ...goals];
    setGoals(updated);
    setNewGoalText("");
    setShowAddGoal(false);
    if (userId !== "unknown") {
      await setDoc(doc(db, "users", userId, "weeklyGoals", newGoal.id), newGoal).catch(() => {});
    }
  };

  const deleteGoal = async (id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    if (userId !== "unknown") {
      await deleteDoc(doc(db, "users", userId, "weeklyGoals", id)).catch(() => {});
    }
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    const updated = goals.map((g) => g.id === id ? { ...g, text: editText.trim() } : g);
    setGoals(updated);
    setEditingGoal(null);
    if (userId !== "unknown") {
      const goal = updated.find((g) => g.id === id);
      if (goal) await setDoc(doc(db, "users", userId, "weeklyGoals", id), goal).catch(() => {});
    }
  };

  const handleSaveProfile = async () => {
    await saveProfile(userId, profile);
    setShowProfile(false);
  };

  const sendAiMessage = async (text?: string) => {
    const messageText = (text || aiInput).trim();
    if (!messageText || aiLoading) return;

    const userMsg = { role: "user", content: messageText };
    const newMessages = [...aiMessages, userMsg];
    setAiMessages(newMessages);
    setAiInput("");
    setAiLoading(true);

    try {
      const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 5);
      const profileStr = Object.entries(profile)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      const systemPrompt = `Ты персональный AI коуч в планировщике CortexAI. Помогаешь составлять еженедельные цели и планы.

Профиль пользователя: ${profileStr || "не заполнен"}

Текущие задачи: ${activeTasks.length > 0 ? activeTasks.map(t => t.title).join(", ") : "нет"}

Текущие цели на неделю (${weekStart}):
${currentWeekGoals.length > 0 ? currentWeekGoals.map(g => `- ${g.text} [${g.completed ? "✅" : "⬜"}]`).join("\n") : "целей нет"}

Ты можешь:
1. Анализировать профиль и предлагать персональный план на неделю
2. Корректировать цели под нагрузку и возможности
3. Проводить короткий анализ прогресса
4. Давать советы по питанию, тренировкам, продуктивности

Если пользователь просит создать цели — добавь в конец:
GOALS_JSON:[{"text":"цель 1"},{"text":"цель 2"},{"text":"цель 3"}]

Отвечай коротко, по делу, на русском. Используй эмодзи.`;

      const response = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          systemPrompt,
        }),
      });

      const data = await response.json();
      const aiResponse = data.content || "⚠️ Ошибка ответа";

      // Парсим цели из ответа
      const goalsMatch = aiResponse.match(/GOALS_JSON:(\[[^\]]+\])/);
      let addedGoals: WeeklyGoal[] = [];

      if (goalsMatch) {
        try {
          const parsedGoals = JSON.parse(goalsMatch[1]);
          addedGoals = parsedGoals.map((g: any, i: number) => ({
            id: `ai_goal_${Date.now()}_${i}`,
            text: g.text,
            completed: false,
            weekStart,
            createdAt: new Date().toISOString(),
            category: "ai",
          }));

          const updatedGoals = [...addedGoals, ...goals];
          setGoals(updatedGoals);

          if (userId !== "unknown") {
            for (const goal of addedGoals) {
              await setDoc(doc(db, "users", userId, "weeklyGoals", goal.id), goal).catch(() => {});
            }
          }
        } catch {}
      }

      const cleanResponse = aiResponse.replace(/GOALS_JSON:\[[^\]]+\]/, "").trim();
      const finalResponse = addedGoals.length > 0
        ? `${cleanResponse}\n\n✅ Добавлено ${addedGoals.length} целей на неделю!`
        : cleanResponse;

      setAiMessages((prev) => [...prev, { role: "assistant", content: finalResponse }]);
    } catch (err) {
      setAiMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Ошибка. Попробуй ещё раз." }]);
    } finally {
      setAiLoading(false);
    }
  };

  const quickPrompts = ru
    ? ["Составь план на неделю", "Проанализируй мой прогресс", "Дай советы по питанию", "Что улучшить?"]
    : ["Create weekly plan", "Analyze my progress", "Nutrition tips", "What to improve?"];

  if (loading) {
    return (
      <div style={{ paddingTop: "20px", textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>{ru ? "Загрузка..." : "Loading..."}</p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "20px" }}>

      {/* Заголовок */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <p style={{ fontSize: "22px", fontWeight: 700, color: "white", margin: 0 }}>
            🎯 {ru ? "Цели на неделю" : "Weekly Goals"}
          </p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {ru ? `Неделя с ${weekStart}` : `Week from ${weekStart}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setShowProfile(true)} style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            👤
          </button>
          <button onClick={() => { setShowAI(true); if (aiMessages.length === 0) { setAiMessages([{ role: "assistant", content: ru ? `Привет! 👋 Я помогу составить твой план на неделю.\n\nЗаполни профиль (кнопка 👤) — и я составлю персональный план для тебя!\n\nИли задай вопрос прямо сейчас.` : `Hi! 👋 I'll help create your weekly plan.\n\nFill in your profile (👤 button) and I'll make a personalized plan!\n\nOr ask a question now.` }]); } }} style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Bot size={18} color="#3b82f6" />
          </button>
        </div>
      </div>

      {/* Прогресс */}
      {currentWeekGoals.length > 0 && (
        <div style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: "14px", padding: "14px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)", margin: 0 }}>
              {ru ? "Прогресс недели" : "Week progress"}
            </p>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#60a5fa", margin: 0 }}>
              {completedCount}/{currentWeekGoals.length}
            </p>
          </div>
          <div style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${currentWeekGoals.length > 0 ? (completedCount / currentWeekGoals.length) * 100 : 0}%`, backgroundColor: "#3b82f6", borderRadius: "3px", transition: "width 0.4s ease" }} />
          </div>
          {completedCount === currentWeekGoals.length && currentWeekGoals.length > 0 && (
            <p style={{ fontSize: "12px", color: "#22c55e", margin: "6px 0 0 0" }}>
              🎉 {ru ? "Все цели выполнены!" : "All goals completed!"}
            </p>
          )}
        </div>
      )}

      {/* Кнопка добавить */}
      <button onClick={() => setShowAddGoal(true)} style={{ width: "100%", height: "44px", borderRadius: "12px", border: "1px dashed rgba(59,130,246,0.4)", backgroundColor: "rgba(59,130,246,0.06)", fontSize: "14px", color: "#60a5fa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "12px" }}>
        <Plus size={16} /> {ru ? "Добавить цель" : "Add goal"}
      </button>

      {/* Форма добавления */}
      {showAddGoal && (
        <div style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "12px", marginBottom: "12px" }}>
          <input autoFocus value={newGoalText} onChange={(e) => setNewGoalText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoal()} placeholder={ru ? "Напиши цель на эту неделю..." : "Write a goal for this week..."} style={{ display: "block", width: "100%", boxSizing: "border-box" as const, height: "42px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "12px", paddingRight: "12px", fontSize: "14px", color: "white", outline: "none", marginBottom: "8px", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowAddGoal(false)} style={{ flex: 1, height: "36px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", color: "rgba(255,255,255,0.5)", fontSize: "13px", cursor: "pointer" }}>
              {ru ? "Отмена" : "Cancel"}
            </button>
            <button onClick={addGoal} disabled={!newGoalText.trim()} style={{ flex: 1, height: "36px", borderRadius: "10px", border: "none", backgroundColor: newGoalText.trim() ? "#3b82f6" : "rgba(255,255,255,0.1)", color: "white", fontSize: "13px", fontWeight: 600, cursor: newGoalText.trim() ? "pointer" : "default" }}>
              {ru ? "Добавить" : "Add"}
            </button>
          </div>
        </div>
      )}

      {/* Список целей */}
      {currentWeekGoals.length === 0 ? (
        <div style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "24px", textAlign: "center" }}>
          <p style={{ fontSize: "32px", margin: "0 0 8px 0" }}>🎯</p>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: "0 0 4px 0", fontWeight: 600 }}>
            {ru ? "Нет целей на эту неделю" : "No goals for this week"}
          </p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", margin: 0 }}>
            {ru ? "Добавь цели сам или попроси AI составить план" : "Add goals manually or ask AI to create a plan"}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {currentWeekGoals.map((goal) => (
            <div key={goal.id} style={{ backgroundColor: "rgba(255,255,255,0.05)", border: goal.completed ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "12px 14px", opacity: goal.completed ? 0.7 : 1, transition: "all 0.2s" }}>
              {editingGoal === goal.id ? (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit(goal.id)} style={{ flex: 1, height: "36px", borderRadius: "8px", border: "1px solid rgba(59,130,246,0.4)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "10px", paddingRight: "10px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit" }} />
                  <button onClick={() => saveEdit(goal.id)} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "none", backgroundColor: "#3b82f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Check size={14} color="white" />
                  </button>
                  <button onClick={() => setEditingGoal(null)} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <X size={14} color="rgba(255,255,255,0.5)" />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button onClick={() => toggleGoal(goal.id)} style={{ width: "22px", height: "22px", minWidth: "22px", borderRadius: "50%", border: `2px solid ${goal.completed ? "#22c55e" : "rgba(255,255,255,0.25)"}`, backgroundColor: goal.completed ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flexShrink: 0, transition: "all 0.2s" }}>
                    {goal.completed && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>}
                  </button>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: goal.completed ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.9)", textDecoration: goal.completed ? "line-through" : "none", margin: 0, flex: 1, wordBreak: "break-word", lineHeight: "1.4", transition: "all 0.2s" }}>
                    {goal.text}
                    {goal.category === "ai" && <span style={{ fontSize: "10px", color: "#60a5fa", marginLeft: "6px" }}>AI</span>}
                  </p>
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    <button onClick={() => { setEditingGoal(goal.id); setEditText(goal.text); }} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "none", backgroundColor: "rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Edit2 size={12} color="rgba(255,255,255,0.4)" />
                    </button>
                    <button onClick={() => deleteGoal(goal.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "none", backgroundColor: "rgba(239,68,68,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 size={12} color="#ef4444" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Модалка профиля */}
      {showProfile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowProfile(false); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#1e293b", borderRadius: "20px", padding: "20px", width: "100%", maxWidth: "340px", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "white", margin: 0 }}>👤 {ru ? "Мой профиль" : "My Profile"}</p>
              <button onClick={() => setShowProfile(false)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={18} color="rgba(255,255,255,0.4)" />
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: "0 0 12px 0" }}>
              {ru ? "AI использует эти данные для персональных рекомендаций" : "AI uses this data for personalized recommendations"}
            </p>

            {[
              { key: "weight", label: ru ? "Вес (кг)" : "Weight (kg)", placeholder: "70" },
              { key: "height", label: ru ? "Рост (см)" : "Height (cm)", placeholder: "175" },
              { key: "age", label: ru ? "Возраст" : "Age", placeholder: "30" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: "12px" }}>
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>{label}</p>
                <input value={(profile as any)[key] || ""} onChange={(e) => setProfile((prev) => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} style={{ display: "block", width: "100%", boxSizing: "border-box" as const, height: "40px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "12px", paddingRight: "12px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit" }} />
              </div>
            ))}

            <div style={{ marginBottom: "12px" }}>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>{ru ? "Уровень активности" : "Activity level"}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[
                  { value: "low", label: ru ? "Низкий (сидячая работа)" : "Low (sedentary)" },
                  { value: "medium", label: ru ? "Средний (тренировки 2-3 раза/нед)" : "Medium (2-3x/week)" },
                  { value: "high", label: ru ? "Высокий (тренировки 5+ раз/нед)" : "High (5+x/week)" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setProfile((prev) => ({ ...prev, fitnessLevel: opt.value }))} style={{ padding: "8px 12px", borderRadius: "10px", border: profile.fitnessLevel === opt.value ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.08)", backgroundColor: profile.fitnessLevel === opt.value ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)", color: profile.fitnessLevel === opt.value ? "#60a5fa" : "rgba(255,255,255,0.6)", fontSize: "13px", cursor: "pointer", textAlign: "left" as const, width: "100%" }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>{ru ? "Мои цели и пожелания" : "My goals and wishes"}</p>
              <textarea value={profile.goals || ""} onChange={(e) => setProfile((prev) => ({ ...prev, goals: e.target.value }))} placeholder={ru ? "Например: хочу похудеть на 5 кг, улучшить продуктивность..." : "E.g: lose 5kg, improve productivity..."} rows={3} style={{ display: "block", width: "100%", boxSizing: "border-box" as const, borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", padding: "10px 12px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit", resize: "none" }} />
            </div>

            <button onClick={handleSaveProfile} style={{ width: "100%", height: "44px", borderRadius: "12px", border: "none", backgroundColor: "#3b82f6", fontSize: "14px", fontWeight: 600, color: "white", cursor: "pointer" }}>
              {ru ? "Сохранить профиль" : "Save profile"}
            </button>
          </div>
        </div>
      )}

      {/* Модалка AI чата */}
      {showAI && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column" }}>
          {/* Шапка */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 16px 12px", backgroundColor: "#0f172a", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bot size={18} color="#3b82f6" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "white", margin: 0 }}>AI {ru ? "Коуч" : "Coach"}</p>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? "Персональный план на неделю" : "Personal weekly plan"}</p>
            </div>
            <button onClick={() => setShowAI(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
              <X size={20} color="rgba(255,255,255,0.5)" />
            </button>
          </div>

          {/* Сообщения */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {aiMessages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "85%", padding: "9px 13px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", backgroundColor: msg.role === "user" ? "#3b82f6" : "rgba(255,255,255,0.07)", border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                  <p style={{ fontSize: "14px", color: msg.role === "user" ? "white" : "rgba(255,255,255,0.9)", margin: 0, lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {msg.content}
                  </p>
                </div>
              </div>
            ))}

            {aiLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 14px", borderRadius: "16px 16px 16px 4px", backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "4px", alignItems: "center" }}>
                  {[0, 1, 2].map((i) => (<div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.4)", animation: `bounce 1s ease-in-out ${i * 0.2}s infinite` }} />))}
                </div>
              </div>
            )}

            {/* Быстрые вопросы */}
            {aiMessages.length <= 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {quickPrompts.map((q) => (
                  <button key={q} onClick={() => sendAiMessage(q)} style={{ padding: "6px 12px", borderRadius: "16px", backgroundColor: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", fontSize: "12px", color: "#93c5fd", cursor: "pointer" }}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Поле ввода */}
          <div style={{ display: "flex", gap: "8px", padding: "12px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#0f172a" }}>
            <textarea value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }} placeholder={ru ? "Спроси AI о плане на неделю..." : "Ask AI about your weekly plan..."} rows={1} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "10px 12px", fontSize: "16px", color: "white", outline: "none", resize: "none", maxHeight: "70px", overflowY: "auto", boxSizing: "border-box", fontFamily: "inherit" }} />
            <button onClick={() => sendAiMessage()} disabled={!aiInput.trim() || aiLoading} style={{ width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%", backgroundColor: aiInput.trim() && !aiLoading ? "#3b82f6" : "rgba(255,255,255,0.08)", border: "none", cursor: aiInput.trim() && !aiLoading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Send size={15} color="white" />
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-4px); opacity: 1; } }
      `}</style>
    </div>
  );
}
