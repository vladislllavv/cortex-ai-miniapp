import { useState, useEffect, useRef } from "react";
import { useI18nStore } from "@/lib/i18n";
import { useTaskStore, getTelegramUserId, checkSubscription } from "@/lib/store";
import { db } from "@/lib/firebase";
import {
  doc, getDoc, setDoc, collection,
  getDocs, deleteDoc, addDoc, Timestamp,
} from "firebase/firestore";
import { Send, Bot, Edit2, Trash2, Plus, Check, X, Lock } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

const AI_WORKER_URL = "https://ancient-river-8a20.bubo-buboff.workers.dev";
const COACH_FREE_LIMIT = 2;
const COACH_USAGE_KEY = "cortex-coach-usage";

function getCoachUsage(): number {
  try {
    const stored = localStorage.getItem(COACH_USAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const today = new Date().toISOString().split("T")[0];
      if (parsed.date === today) return parsed.count;
    }
  } catch {}
  return 0;
}

function setCoachUsage(count: number) {
  const today = new Date().toISOString().split("T")[0];
  localStorage.setItem(COACH_USAGE_KEY, JSON.stringify({ date: today, count }));
}

interface WeeklyGoal {
  id: string;
  text: string;
  completed: boolean;
  weekStart: string;
  createdAt: string;
  category?: string;
  dueDate?: string;
}

interface UserProfile {
  weight?: string;
  height?: string;
  age?: string;
  fitnessLevel?: string;
  goals?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
  const tasks = useTaskStore((state) => state.tasks);
  const addTask = useTaskStore((state) => state.addTask);
  const { theme } = useTheme();
  const ru = language === "ru";
  const userId = getTelegramUserId();

  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [profile, setProfile] = useState<UserProfile>({});
  const [showProfile, setShowProfile] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newGoalText, setNewGoalText] = useState("");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [coachUsage, setCoachUsageState] = useState(() => getCoachUsage());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const weekStart = getWeekStart();
  const currentWeekGoals = goals.filter((g) => g.weekStart === weekStart);
  const completedCount = currentWeekGoals.filter((g) => g.completed).length;
  const isLimited = hasSubscription === false && coachUsage >= COACH_FREE_LIMIT;

  useEffect(() => {
    checkSubscription(userId).then(setHasSubscription);
    if (userId === "unknown") { setLoading(false); return; }
    const load = async () => {
      setLoading(true);
      try {
        const [goalsSnap, profileSnap] = await Promise.all([
          getDocs(collection(db, "users", userId, "weeklyGoals")),
          getDoc(doc(db, "users", userId, "settings", "profile")),
        ]);
        const loadedGoals: WeeklyGoal[] = [];
        goalsSnap.forEach((d) => loadedGoals.push(d.data() as WeeklyGoal));
        setGoals(loadedGoals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        if (profileSnap.exists()) setProfile(profileSnap.data() as UserProfile);
      } catch {}
      setLoading(false);
    };
    load();
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const toggleGoal = async (id: string) => {
    const updated = goals.map((g) => g.id === id ? { ...g, completed: !g.completed } : g);
    setGoals(updated);
    if (userId !== "unknown") {
      const goal = updated.find((g) => g.id === id);
      if (goal) await setDoc(doc(db, "users", userId, "weeklyGoals", id), goal).catch(() => {});
    }
  };

  // Добавить цель и создать задачу для синхронизации + уведомления
  const addGoalWithTask = async (text: string, dueDate?: string) => {
    const goalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const newGoal: WeeklyGoal = {
      id: goalId,
      text,
      completed: false,
      weekStart,
      createdAt: new Date().toISOString(),
      category: "ai",
      dueDate,
    };

    setGoals((prev) => [newGoal, ...prev]);

    if (userId !== "unknown") {
      // Сохраняем цель
      await setDoc(doc(db, "users", userId, "weeklyGoals", goalId), newGoal).catch(() => {});

      // Создаём задачу в store — появится на главном экране СРАЗУ
      const savedTask = await addTask({
        title: `🎯 ${text}`,
        dueDate: dueDate || undefined,
        priority: "medium",
        status: "todo",
        isAiCreated: true,
        repeat: "none",
        type: "task",
        description: ru ? "Цель недели от AI коуча" : "Weekly goal from AI coach",
        items: [],
      });

      // Если есть дата — добавляем в /tasks для push уведомления от бота
      if (dueDate && savedTask) {
        const dueObj = new Date(dueDate);
        if (!isNaN(dueObj.getTime()) && dueObj > new Date()) {
          addDoc(collection(db, "tasks"), {
            userId,
            taskId: savedTask.id,
            title: `🎯 ${text}`,
            description: ru ? "Цель недели от AI коуча" : "Weekly goal from AI coach",
            dueDate,
            priority: "medium",
            status: "todo",
            createdAt: new Date().toISOString(),
            isSent: false,
            reminderAt: Timestamp.fromDate(dueObj),
            repeat: "none",
            type: "task",
          }).catch(() => {});
        }
      }
    }

    return newGoal;
  };

  const addManualGoal = async () => {
    if (!newGoalText.trim()) return;
    await addGoalWithTask(newGoalText.trim());
    setNewGoalText("");
    setShowAddGoal(false);
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
    if (userId !== "unknown") {
      await setDoc(doc(db, "users", userId, "settings", "profile"), profile).catch(() => {});
    }
    setShowProfile(false);
  };

  const sendAiMessage = async (text?: string) => {
    const messageText = (text || aiInput).trim();
    if (!messageText || aiLoading) return;

    // Проверяем лимит
    if (isLimited) {
      const tg = (window as any).Telegram?.WebApp;
      tg?.showAlert(
        ru
          ? `Лимит ${COACH_FREE_LIMIT} запросов в день 🤖\n\nОформи подписку для безлимитного доступа к AI коучу!`
          : `Daily limit of ${COACH_FREE_LIMIT} requests 🤖\n\nGet subscription for unlimited AI coach access!`
      );
      tg?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe");
      return;
    }

    const userMsg: ChatMessage = { role: "user", content: messageText };
    const newMessages = [...aiMessages, userMsg];
    setAiMessages(newMessages);
    setAiInput("");
    setAiLoading(true);

    // Увеличиваем счётчик только без подписки
    if (hasSubscription === false) {
      const nc = coachUsage + 1;
      setCoachUsageState(nc);
      setCoachUsage(nc);
    }

    try {
      const activeTasks = tasks.filter((t) => t.status !== "done").slice(0, 5);
      const profileStr = Object.entries(profile).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ");

      const systemPrompt = `Ты персональный AI коуч в приложении CortexAI. Ведёшь диалог с пользователем.

Профиль: ${profileStr || "не заполнен"}
Активные задачи: ${activeTasks.map(t => t.title).join(", ") || "нет"}
Цели этой недели: ${currentWeekGoals.length > 0 ? currentWeekGoals.map(g => `${g.text} [${g.completed ? "✅" : "⬜"}]`).join(", ") : "нет"}

Ты можешь задавать уточняющие вопросы. Когда готов создать цели — добавь в конец:
GOALS_JSON:[{"text":"цель","dueDate":"ISO_или_null"}]

Правила:
- Отвечай коротко (2-3 предложения)
- Только на русском
- Используй эмодзи
- Задавай 1 вопрос если нужно уточнение
- dueDate = null если нет конкретной даты`;

      const response = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          systemPrompt,
        }),
      });

      if (!response.ok) throw new Error(`Worker error: ${response.status}`);
      const data = await response.json();
      const aiResponse = data.content || "⚠️ Нет ответа";

      // Парсим цели из ответа
      const goalsMatch = aiResponse.match(/GOALS_JSON:(\[[\s\S]*?\])/);
      let addedCount = 0;

      if (goalsMatch) {
        try {
          const parsedGoals = JSON.parse(goalsMatch[1]);
          for (const g of parsedGoals) {
            if (g.text && g.text.trim().length > 1) {
              await addGoalWithTask(g.text.trim(), g.dueDate || undefined);
              addedCount++;
            }
          }
        } catch (e) {
          console.error("Goals parse error:", e);
        }
      }

      const cleanResponse = aiResponse.replace(/GOALS_JSON:\[[\s\S]*?\]/, "").trim();

      const finalMsg = addedCount > 0
        ? `${cleanResponse}\n\n✅ ${ru ? `Добавлено ${addedCount} целей в список задач!` : `Added ${addedCount} goals to your task list!`}`
        : cleanResponse;

      setAiMessages((prev) => [...prev, { role: "assistant", content: finalMsg }]);
    } catch (err) {
      console.error("AI error:", err);
      setAiMessages((prev) => [...prev, {
        role: "assistant",
        content: ru ? "⚠️ Ошибка подключения. Попробуй ещё раз." : "⚠️ Connection error. Try again.",
      }]);
    } finally {
      setAiLoading(false);
    }
  };

  const quickPrompts = ru
    ? ["Составь план на неделю", "Оцени мой прогресс", "Дай советы по продуктивности", "Еженедельный тест"]
    : ["Create weekly plan", "Assess my progress", "Productivity tips", "Weekly check-in"];

  if (loading) {
    return (
      <div style={{ paddingTop: "40px", textAlign: "center" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: theme.primary, animation: "pulse-dot 1s ease-in-out infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>{ru ? "Загрузка..." : "Loading..."}</p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: "8px", paddingBottom: "20px" }}>

      {/* Заголовок */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <p style={{ fontSize: "22px", fontWeight: 700, color: "white", margin: 0 }}>🎯 {ru ? "Цели на неделю" : "Weekly Goals"}</p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>{ru ? `Неделя с ${weekStart}` : `Week from ${weekStart}`}</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setShowProfile(true)} style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: "18px" }}>👤</button>
          <button
            onClick={() => {
              setShowAI(true);
              if (aiMessages.length === 0) {
                setAiMessages([{
                  role: "assistant",
                  content: ru
                    ? `Привет! 👋 Я твой AI коуч.\n\n${hasSubscription === false ? `⚠️ Осталось ${COACH_FREE_LIMIT - coachUsage} из ${COACH_FREE_LIMIT} бесплатных запросов.\n\n` : ""}Заполни профиль 👤 — и я составлю персональный план!\n\nИли задай вопрос прямо сейчас 💪`
                    : `Hi! 👋 I'm your AI coach.\n\n${hasSubscription === false ? `⚠️ ${COACH_FREE_LIMIT - coachUsage} of ${COACH_FREE_LIMIT} free requests left.\n\n` : ""}Fill your profile 👤 and I'll make a personal plan!\n\nOr ask me anything now 💪`,
                }]);
              }
            }}
            style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: `${theme.primary}30`, border: `1px solid ${theme.primary}50`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <Bot size={18} color={theme.primary} />
          </button>
        </div>
      </div>

      {/* Лимит запросов */}
      {hasSubscription === false && (
        <div style={{
          backgroundColor: isLimited ? "rgba(239,68,68,0.08)" : `${theme.primary}10`,
          border: isLimited ? "1px solid rgba(239,68,68,0.2)" : `1px solid ${theme.primary}25`,
          borderRadius: "12px", padding: "8px 12px", marginBottom: "12px",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          {isLimited ? <Lock size={14} color="#ef4444" /> : <Bot size={14} color={theme.primary} />}
          <p style={{ fontSize: "12px", color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.5)", margin: 0, flex: 1 }}>
            {isLimited
              ? (ru ? "Лимит AI коуча исчерпан" : "AI coach limit reached")
              : (ru ? `AI коуч: ${COACH_FREE_LIMIT - coachUsage} из ${COACH_FREE_LIMIT} бесплатных запросов` : `AI coach: ${COACH_FREE_LIMIT - coachUsage} of ${COACH_FREE_LIMIT} free requests`)}
          </p>
          {isLimited && (
            <button
              onClick={() => { const tg = (window as any).Telegram?.WebApp; tg?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe"); }}
              style={{ height: "26px", paddingLeft: "10px", paddingRight: "10px", borderRadius: "8px", border: "none", backgroundColor: theme.primary, color: "white", fontSize: "11px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
            >
              {ru ? "Подписка" : "Subscribe"}
            </button>
          )}
        </div>
      )}

      {/* Прогресс */}
      {currentWeekGoals.length > 0 && (
        <div style={{ backgroundColor: `${theme.primary}12`, border: `1px solid ${theme.primary}25`, borderRadius: "14px", padding: "14px", marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.7)", margin: 0 }}>{ru ? "Прогресс недели" : "Week progress"}</p>
            <p style={{ fontSize: "13px", fontWeight: 700, color: theme.primary, margin: 0 }}>{completedCount}/{currentWeekGoals.length}</p>
          </div>
          <div style={{ height: "6px", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${currentWeekGoals.length > 0 ? (completedCount / currentWeekGoals.length) * 100 : 0}%`, backgroundColor: theme.primary, borderRadius: "3px", transition: "width 0.4s ease" }} />
          </div>
          {completedCount === currentWeekGoals.length && currentWeekGoals.length > 0 && (
            <p style={{ fontSize: "12px", color: "#22c55e", margin: "6px 0 0 0" }}>🎉 {ru ? "Все цели выполнены!" : "All goals completed!"}</p>
          )}
        </div>
      )}

      {/* Кнопка добавить */}
      <button onClick={() => setShowAddGoal(true)} style={{ width: "100%", height: "44px", borderRadius: "12px", border: `1px dashed ${theme.primary}60`, backgroundColor: `${theme.primary}08`, fontSize: "14px", color: theme.primary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "12px" }}>
        <Plus size={16} /> {ru ? "Добавить цель" : "Add goal"}
      </button>

      {/* Форма добавления */}
      {showAddGoal && (
        <div style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "12px", marginBottom: "12px" }}>
          <input autoFocus value={newGoalText} onChange={(e) => setNewGoalText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addManualGoal()} placeholder={ru ? "Напиши цель на эту неделю..." : "Write a goal for this week..."} style={{ display: "block", width: "100%", boxSizing: "border-box" as const, height: "42px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "12px", paddingRight: "12px", fontSize: "14px", color: "white", outline: "none", marginBottom: "8px", fontFamily: "inherit" }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => setShowAddGoal(false)} style={{ flex: 1, height: "36px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", color: "rgba(255,255,255,0.5)", fontSize: "13px", cursor: "pointer" }}>{ru ? "Отмена" : "Cancel"}</button>
            <button onClick={addManualGoal} disabled={!newGoalText.trim()} style={{ flex: 1, height: "36px", borderRadius: "10px", border: "none", backgroundColor: newGoalText.trim() ? theme.primary : "rgba(255,255,255,0.1)", color: "white", fontSize: "13px", fontWeight: 600, cursor: newGoalText.trim() ? "pointer" : "default" }}>{ru ? "Добавить" : "Add"}</button>
          </div>
        </div>
      )}

      {/* Список целей */}
      {currentWeekGoals.length === 0 ? (
        <div style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "24px", textAlign: "center" }}>
          <p style={{ fontSize: "32px", margin: "0 0 8px 0" }}>🎯</p>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", margin: "0 0 4px 0", fontWeight: 600 }}>{ru ? "Нет целей на эту неделю" : "No goals this week"}</p>
          <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", margin: 0 }}>{ru ? "Добавь сам или попроси AI коуча" : "Add manually or ask AI coach"}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {currentWeekGoals.map((goal) => (
            <div key={goal.id} style={{ backgroundColor: "rgba(255,255,255,0.05)", border: goal.completed ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "12px 14px", opacity: goal.completed ? 0.7 : 1, transition: "all 0.2s" }}>
              {editingGoal === goal.id ? (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit(goal.id)} style={{ flex: 1, height: "36px", borderRadius: "8px", border: `1px solid ${theme.primary}60`, backgroundColor: "rgba(255,255,255,0.07)", paddingLeft: "10px", paddingRight: "10px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit" }} />
                  <button onClick={() => saveEdit(goal.id)} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "none", backgroundColor: theme.primary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={14} color="white" /></button>
                  <button onClick={() => setEditingGoal(null)} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={14} color="rgba(255,255,255,0.5)" /></button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button onClick={() => toggleGoal(goal.id)} style={{ width: "22px", height: "22px", minWidth: "22px", borderRadius: "50%", border: `2px solid ${goal.completed ? "#22c55e" : "rgba(255,255,255,0.25)"}`, backgroundColor: goal.completed ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, flexShrink: 0, transition: "all 0.2s" }}>
                    {goal.completed && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: "14px", fontWeight: 500, color: goal.completed ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.9)", textDecoration: goal.completed ? "line-through" : "none", margin: 0, wordBreak: "break-word", lineHeight: "1.4" }}>
                      {goal.text}
                      {goal.category === "ai" && <span style={{ fontSize: "10px", color: theme.primary, marginLeft: "6px", backgroundColor: `${theme.primary}20`, padding: "1px 5px", borderRadius: "6px" }}>AI</span>}
                    </p>
                    {goal.dueDate && (
                      <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", margin: "2px 0 0 0" }}>
                        ⏰ {new Date(goal.dueDate).toLocaleString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    <button onClick={() => { setEditingGoal(goal.id); setEditText(goal.text); }} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "none", backgroundColor: "rgba(255,255,255,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Edit2 size={12} color="rgba(255,255,255,0.4)" /></button>
                    <button onClick={() => deleteGoal(goal.id)} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "none", backgroundColor: "rgba(239,68,68,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Trash2 size={12} color="#ef4444" /></button>
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
              <button onClick={() => setShowProfile(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={18} color="rgba(255,255,255,0.4)" /></button>
            </div>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: "0 0 16px 0" }}>{ru ? "AI коуч использует эти данные для персональных рекомендаций" : "AI coach uses this for personalized recommendations"}</p>

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
                  { value: "medium", label: ru ? "Средний (2-3 тренировки/нед)" : "Medium (2-3x/week)" },
                  { value: "high", label: ru ? "Высокий (5+ тренировок/нед)" : "High (5+x/week)" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setProfile((prev) => ({ ...prev, fitnessLevel: opt.value }))} style={{ padding: "8px 12px", borderRadius: "10px", border: profile.fitnessLevel === opt.value ? `1px solid ${theme.primary}` : "1px solid rgba(255,255,255,0.08)", backgroundColor: profile.fitnessLevel === opt.value ? `${theme.primary}20` : "rgba(255,255,255,0.04)", color: profile.fitnessLevel === opt.value ? theme.primary : "rgba(255,255,255,0.6)", fontSize: "13px", cursor: "pointer", textAlign: "left" as const, width: "100%" }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", margin: "0 0 6px 0" }}>{ru ? "Мои цели" : "My goals"}</p>
              <textarea value={profile.goals || ""} onChange={(e) => setProfile((prev) => ({ ...prev, goals: e.target.value }))} placeholder={ru ? "Похудеть, улучшить продуктивность..." : "Lose weight, improve productivity..."} rows={3} style={{ display: "block", width: "100%", boxSizing: "border-box" as const, borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.07)", padding: "10px 12px", fontSize: "14px", color: "white", outline: "none", fontFamily: "inherit", resize: "none" }} />
            </div>

            <button onClick={handleSaveProfile} style={{ width: "100%", height: "44px", borderRadius: "12px", border: "none", backgroundColor: theme.primary, fontSize: "14px", fontWeight: 600, color: "white", cursor: "pointer" }}>
              {ru ? "Сохранить профиль" : "Save profile"}
            </button>
          </div>
        </div>
      )}

      {/* AI коуч чат */}
      {showAI && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column" }}>

          {/* Шапка */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 16px 12px", backgroundColor: theme.bg, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", backgroundColor: `${theme.primary}20`, border: `1px solid ${theme.primary}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Bot size={18} color={theme.primary} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "white", margin: 0 }}>AI {ru ? "Коуч" : "Coach"}</p>
              <p style={{ fontSize: "11px", color: isLimited ? "#fca5a5" : "rgba(255,255,255,0.4)", margin: 0 }}>
                {hasSubscription === true
                  ? (ru ? "Безлимитный доступ ✅" : "Unlimited access ✅")
                  : isLimited
                  ? (ru ? "Лимит исчерпан" : "Limit reached")
                  : (ru ? `${COACH_FREE_LIMIT - coachUsage} из ${COACH_FREE_LIMIT} запросов` : `${COACH_FREE_LIMIT - coachUsage} of ${COACH_FREE_LIMIT}`)}
              </p>
            </div>
            <button onClick={() => setShowAI(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
              <X size={20} color="rgba(255,255,255,0.5)" />
            </button>
          </div>

          {/* Сообщения */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {aiMessages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "85%", padding: "9px 13px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", backgroundColor: msg.role === "user" ? theme.primary : "rgba(255,255,255,0.07)", border: msg.role === "assistant" ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
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
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginLeft: "4px" }}>{ru ? "Думаю..." : "Thinking..."}</span>
                </div>
              </div>
            )}

            {/* Быстрые вопросы */}
            {aiMessages.length <= 1 && !isLimited && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                {quickPrompts.map((q) => (
                  <button key={q} onClick={() => sendAiMessage(q)} style={{ padding: "6px 12px", borderRadius: "16px", backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}30`, fontSize: "12px", color: theme.primary, cursor: "pointer" }}>
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Лимит исчерпан */}
            {isLimited && (
              <div style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", padding: "14px", textAlign: "center" }}>
                <p style={{ fontSize: "13px", color: "#fca5a5", margin: "0 0 10px 0" }}>
                  {ru ? `Лимит ${COACH_FREE_LIMIT} запросов в день исчерпан 🤖` : `Daily limit of ${COACH_FREE_LIMIT} requests reached 🤖`}
                </p>
                <button onClick={() => { const tg = (window as any).Telegram?.WebApp; tg?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe"); }} style={{ height: "36px", paddingLeft: "16px", paddingRight: "16px", borderRadius: "10px", border: "none", backgroundColor: theme.primary, color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  {ru ? "Оформить подписку" : "Get subscription"}
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Поле ввода */}
          <div style={{ display: "flex", gap: "8px", padding: "12px 16px 20px", borderTop: "1px solid rgba(255,255,255,0.07)", backgroundColor: theme.bg }}>
            {isLimited ? (
              <button onClick={() => { const tg = (window as any).Telegram?.WebApp; tg?.openTelegramLink("https://t.me/aiplannerrubot?start=subscribe"); }} style={{ flex: 1, height: "44px", borderRadius: "14px", border: "none", backgroundColor: theme.primary, color: "white", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                🔓 {ru ? "Оформить подписку для продолжения" : "Get subscription to continue"}
              </button>
            ) : (
              <>
                <textarea
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                  placeholder={ru ? "Ответь или задай вопрос AI коучу..." : "Reply or ask AI coach..."}
                  rows={1}
                  style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "14px", padding: "10px 12px", fontSize: "16px", color: "white", outline: "none", resize: "none", maxHeight: "70px", overflowY: "auto", boxSizing: "border-box", fontFamily: "inherit" }}
                />
                <button onClick={() => sendAiMessage()} disabled={!aiInput.trim() || aiLoading} style={{ width: "40px", height: "40px", minWidth: "40px", borderRadius: "50%", backgroundColor: aiInput.trim() && !aiLoading ? theme.primary : "rgba(255,255,255,0.08)", border: "none", cursor: aiInput.trim() && !aiLoading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Send size={15} color="white" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce { 0%, 100% { transform: translateY(0); opacity: 0.4; } 50% { transform: translateY(-4px); opacity: 1; } }
        @keyframes pulse-dot { 0%, 100% { opacity: 0.4; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
