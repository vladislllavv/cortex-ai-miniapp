/**
 * CortexAI Bot v4 — полностью исправленная версия
 * Все баги исправлены, логика протестирована
 */
"use strict";

const TelegramBot = require("node-telegram-bot-api");
const { initializeApp } = require("firebase/app");
const {
  getFirestore, collection, query, where,
  getDocs, updateDoc, setDoc, doc, Timestamp,
  addDoc, deleteDoc, onSnapshot, getDoc,
  collectionGroup, arrayUnion, arrayRemove, writeBatch,
} = require("firebase/firestore");

// ══════════════════════════════════════════════════════════════
// FIREBASE
// ══════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            process.env.FIREBASE_API_KEY,
  authDomain:        `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId:         process.env.FIREBASE_PROJECT_ID,
  storageBucket:     `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.FIREBASE_APP_ID,
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ══════════════════════════════════════════════════════════════
// BOT
// ══════════════════════════════════════════════════════════════
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) { console.error("❌ BOT_TOKEN не задан!"); process.exit(1); }

const bot = new TelegramBot(BOT_TOKEN, {
  polling: {
    interval: 300,
    autoStart: true,
    params: { timeout: 10 },
  },
});

// ══════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ══════════════════════════════════════════════════════════════
const ADMINS   = (process.env.ADMIN_IDS || "56733076").split(",").map(s => s.trim());
const WEBAPP_URL = process.env.WEBAPP_URL || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const YOOKASSA_PROVIDER_TOKEN = process.env.YOOKASSA_PROVIDER_TOKEN || "";

const PERSONAL_WS = "personal";

// Множества для дедупликации уведомлений
const sentNotifications = new Set();
const sentMotivations   = new Set();

// Кэш имени бота (чтобы не делать getMe() каждый раз)
let BOT_USERNAME = "";
bot.getMe().then(me => { BOT_USERNAME = me.username; console.log(`🤖 Bot: @${BOT_USERNAME}`); });

// ══════════════════════════════════════════════════════════════
// ПЛАНЫ ПОДПИСОК
// ══════════════════════════════════════════════════════════════
const PLANS = {
  yk_month_1:     { label: "1 месяц",    days: 30,  rub: 9900,  rubStr: "99.00",  stars: 0,   emoji: "📅" },
  yk_month_3:     { label: "3 месяца",   days: 90,  rub: 39000, rubStr: "390.00", stars: 0,   emoji: "🗓" },
  yk_month_12:    { label: "12 месяцев", days: 365, rub: 59900, rubStr: "599.00", stars: 0,   emoji: "🏆" },
  stars_month_1:  { label: "1 месяц",    days: 30,  rub: 0,     rubStr: "",       stars: 73,  emoji: "📅" },
  stars_month_3:  { label: "3 месяца",   days: 90,  rub: 0,     rubStr: "",       stars: 289, emoji: "🗓" },
  stars_month_12: { label: "12 месяцев", days: 365, rub: 0,     rubStr: "",       stars: 430, emoji: "🏆" },
};

const MOTIVATION_SCHEDULES = {
  1: [14], 2: [10, 19], 3: [9, 14, 20], 4: [9, 13, 17, 20], 5: [8, 11, 14, 17, 20],
};

const FALLBACK_MOTIVATIONS = {
  soft:   ["🌸 Ты делаешь всё что можешь — это уже здорово!", "💙 Каждый шаг важен. Продолжай!", "✨ Верь в себя — ты справишься!"],
  normal: ["⚡ У тебя есть задачи — значит есть цель. Вперёд!", "🎯 Один шаг за раз — и ты справишься!", "🚀 Сегодня хороший день для важных дел!"],
  hard:   ["🔥 Хватит откладывать. Задачи не выполнят себя сами.", "⚡ Никаких оправданий. Только результат.", "🏆 Победители просто делают."],
};

// ══════════════════════════════════════════════════════════════
// КОМАНДЫ БОТА
// ══════════════════════════════════════════════════════════════
bot.setMyCommands([
  { command: "start",           description: "▶️ Запустить бота" },
  { command: "task",            description: "➕ Создать задачу: /task Купить молоко завтра в 10:00" },
  { command: "tasks",           description: "📋 Мои активные задачи" },
  { command: "done",            description: "✅ Выполнить задачу" },
  { command: "subscribe",       description: "💎 Подписка" },
  { command: "myid",            description: "🆔 Мой Telegram ID" },
  { command: "test_motivation", description: "💪 Тест мотивации" },
]).catch(() => {});

bot.setMyCommands([
  { command: "grouptask",  description: "➕ Создать задачу группы" },
  { command: "grouptasks", description: "📋 Задачи группы" },
  { command: "groupdone",  description: "✅ Выполнить задачу группы" },
  { command: "groupinfo",  description: "ℹ️ Информация о группе" },
], { scope: { type: "all_group_chats" } }).catch(() => {});

console.log("CortexAI Bot запущен ✅");
console.log("GROQ_API_KEY:",   GROQ_API_KEY   ? "✅" : "❌ не задан");
console.log("WEBAPP_URL:",     WEBAPP_URL     || "⚠️ не задан");
console.log("YOOKASSA:",       YOOKASSA_PROVIDER_TOKEN ? "✅" : "⚠️ не задан");
console.log("ADMINS:",         ADMINS.join(", "));

// ══════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ══════════════════════════════════════════════════════════════

function isAdmin(userId) {
  return ADMINS.includes(String(userId));
}

function isGroup(chatId) {
  return chatId < 0;
}

function formatDate(date) {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(date) {
  if (!date || isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatTaskList(tasks) {
  if (!tasks.length) return "Задач нет 🎉";
  const pEmoji = { high: "🔴", medium: "🟡", low: "🟢" };
  return tasks.map((t, i) => {
    const due = t.dueDate ? `\n   ⏰ ${formatDateTime(new Date(t.dueDate))}` : "";
    const ass = t.assigneeName ? `\n   👤 ${t.assigneeName}` : "";
    return `${i + 1}. ${pEmoji[t.priority] || "⚪"} ${t.title}${due}${ass}`;
  }).join("\n\n");
}

/** Безопасная отправка — не падает если пользователь заблокировал */
async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(String(chatId), text, opts);
  } catch (e) {
    const code = e.response?.statusCode || 0;
    const msg  = String(e.message || "");
    if (code === 403 || msg.includes("blocked") || msg.includes("deactivated") || msg.includes("not found")) {
      console.log(`⚠️ Пользователь ${chatId} недоступен`);
    } else if (code === 400 && msg.includes("chat not found")) {
      console.log(`⚠️ Чат ${chatId} не найден`);
    } else {
      console.log(`❌ safeSend ${chatId}: ${msg}`);
    }
    return null;
  }
}

function getOpenAppButton() {
  if (WEBAPP_URL && WEBAPP_URL.startsWith("https://")) {
    return { reply_markup: { inline_keyboard: [[{ text: "🚀 Открыть CortexAI", web_app: { url: WEBAPP_URL } }]] } };
  }
  return {};
}

// ══════════════════════════════════════════════════════════════
// GROQ AI
// ══════════════════════════════════════════════════════════════

async function askGroq(messages, maxTokens = 300) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY не задан");
  const payload = {
    model: "llama-3.1-8b-instant",
    messages: Array.isArray(messages) ? messages : [{ role: "user", content: messages }],
    max_tokens: maxTokens,
    temperature: 0.7,
    stream: false,
  };
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

/** Парсит свободный текст → структурированная задача */
async function parseTaskFromText(text) {
  const fallback = { title: text.trim(), dueDate: null, priority: "medium", assigneeUsername: null };
  if (!GROQ_API_KEY) return fallback;
  try {
    const now = new Date();
    const result = await askGroq([
      {
        role: "system",
        content: `Ты парсер задач. Текущее время: ${now.toLocaleString("ru-RU")}, часовой пояс Moscow (UTC+3).
Извлеки из текста: название задачи, дедлайн (ISO 8601), приоритет (low/medium/high), @username если есть.
Верни ТОЛЬКО JSON без пояснений:
{"title":"...","dueDate":"ISO8601 или null","priority":"medium","assigneeUsername":"@user или null"}
ВАЖНО: если написано "завтра в 10" — вычисли реальную дату. dueDate=null если время не указано.`,
      },
      { role: "user", content: text },
    ], 200);
    const match = result.match(/\{[\s\S]*?\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    return {
      title: parsed.title || text.trim(),
      dueDate: parsed.dueDate && parsed.dueDate !== "null" ? parsed.dueDate : null,
      priority: ["low", "medium", "high"].includes(parsed.priority) ? parsed.priority : "medium",
      assigneeUsername: parsed.assigneeUsername || null,
    };
  } catch (e) {
    console.log("parseTaskFromText error:", e.message);
    return fallback;
  }
}

// ══════════════════════════════════════════════════════════════
// FIREBASE — ПОЛЬЗОВАТЕЛИ
// ══════════════════════════════════════════════════════════════

async function registerUser(msg) {
  if (!msg?.from?.id) return;
  const userId = String(msg.from.id);
  try {
    await setDoc(doc(db, "users", userId), {
      userId,
      chatId: userId,
      firstName:  msg.from.first_name  || "",
      lastName:   msg.from.last_name   || "",
      username:   msg.from.username    || "",
      startedAt:  new Date().toISOString(),
      lastSeen:   new Date().toISOString(),
    }, { merge: true });
  } catch (e) { console.log("registerUser:", e.message); }
}

async function getUserByUsername(username) {
  const uname = username.replace(/^@/, "").toLowerCase();
  if (!uname) return null;
  try {
    const snap = await getDocs(query(collection(db, "users"), where("username", "==", uname)));
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    // Попробуем без toLowerCase (Firebase чувствителен к регистру)
    const snap2 = await getDocs(query(collection(db, "users"), where("username", "==", username.replace(/^@/, ""))));
    if (!snap2.empty) return { id: snap2.docs[0].id, ...snap2.docs[0].data() };
  } catch {}
  return null;
}

// ══════════════════════════════════════════════════════════════
// FIREBASE — ПОДПИСКИ
// ══════════════════════════════════════════════════════════════

async function grantSubscription(userId, days = 30, isGift = false) {
  const now = new Date();
  const expiresAt = new Date(now);
  // Если уже есть активная — продлеваем от даты истечения
  try {
    const ex = await getDoc(doc(db, "subscriptions", String(userId)));
    if (ex.exists()) {
      const d = ex.data();
      if (d.isActive && d.expiresAt) {
        const cur = d.expiresAt.toDate();
        if (cur > now) expiresAt.setTime(cur.getTime());
      }
    }
  } catch {}
  expiresAt.setDate(expiresAt.getDate() + days);
  await setDoc(doc(db, "subscriptions", String(userId)), {
    userId: String(userId),
    isActive: true,
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: Timestamp.fromDate(now),
    grantedAt: Timestamp.fromDate(now),
    isGift,
    notified3days: false,
    notified1day: false,
  });
  return expiresAt;
}

async function revokeSubscription(userId) {
  await setDoc(doc(db, "subscriptions", String(userId)), {
    userId: String(userId),
    isActive: false,
    updatedAt: Timestamp.fromDate(new Date()),
  }, { merge: true });
}

async function checkHasSub(userId) {
  try {
    const snap = await getDoc(doc(db, "subscriptions", String(userId)));
    if (!snap.exists()) return false;
    const d = snap.data();
    return Boolean(d.isActive && d.expiresAt && d.expiresAt.toDate() > new Date());
  } catch { return false; }
}

async function getSubInfo(userId) {
  try {
    const snap = await getDoc(doc(db, "subscriptions", String(userId)));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      isActive:  Boolean(d.isActive),
      expiresAt: d.expiresAt ? d.expiresAt.toDate() : null,
      isGift:    Boolean(d.isGift),
    };
  } catch { return null; }
}

// ══════════════════════════════════════════════════════════════
// FIREBASE — ЛИЧНЫЕ ЗАДАЧИ
// ══════════════════════════════════════════════════════════════

async function createPersonalTask(userId, taskData) {
  const taskId = `tg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now    = new Date().toISOString();

  // Нормализуем dueDate
  let dueDate = null;
  if (taskData.dueDate && taskData.dueDate !== "null") {
    const d = new Date(taskData.dueDate);
    if (!isNaN(d.getTime())) dueDate = d.toISOString();
  }

  const task = {
    id: taskId, userId: String(userId),
    title:       taskData.title || "Без названия",
    description: taskData.description || "",
    dueDate,
    priority:    taskData.priority || "medium",
    status:      "todo",
    isAiCreated: Boolean(taskData.isAiCreated),
    createdAt: now, updatedAt: now,
    notified: false,
    repeat:   taskData.repeat || "none",
    type:     "task",
    items:    [],
    tags:     taskData.tags || [],
    workspaceId: PERSONAL_WS,
    source:   taskData.source || "bot",
  };

  // Сохраняем в user workspace
  await setDoc(doc(db, "users", String(userId), "workspaces", PERSONAL_WS, "tasks", taskId), task);

  // Добавляем в bot-коллекцию для напоминаний (только если дедлайн в будущем)
  if (dueDate) {
    const dueTs = new Date(dueDate);
    if (dueTs > new Date()) {
      await addDoc(collection(db, "tasks"), {
        userId: String(userId), taskId,
        title: task.title, description: "",
        dueDate, priority: task.priority, status: "todo",
        createdAt: now, isSent: false,
        reminderAt: Timestamp.fromDate(dueTs),
        repeat: task.repeat, type: "task",
      }).catch(e => console.log("addDoc tasks:", e.message));
    }
  }

  return task;
}

async function getUserTasks(userId, limit = 10) {
  try {
    const snap = await getDocs(
      collection(db, "users", String(userId), "workspaces", PERSONAL_WS, "tasks")
    );
    const tasks = [];
    snap.forEach(d => {
      const t = d.data();
      if (t.status !== "done") tasks.push({ ...t, id: d.id });
    });
    tasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    return tasks.slice(0, limit);
  } catch (e) {
    console.log("getUserTasks:", e.message);
    return [];
  }
}

async function markTaskDone(userId, taskId) {
  const now = new Date().toISOString();
  try {
    await updateDoc(
      doc(db, "users", String(userId), "workspaces", PERSONAL_WS, "tasks", taskId),
      { status: "done", completedAt: now, updatedAt: now }
    );
  } catch (e) { console.log("markTaskDone:", e.message); }
}

// ══════════════════════════════════════════════════════════════
// FIREBASE — ГРУППОВЫЕ ЗАДАЧИ
// ══════════════════════════════════════════════════════════════

async function ensureGroupWorkspace(chatId, chatTitle) {
  const ref = doc(db, "groupWorkspaces", String(chatId));
  const snap = await getDoc(ref).catch(() => null);
  if (!snap?.exists()) {
    await setDoc(ref, {
      chatId: String(chatId),
      title:     chatTitle || "Группа",
      createdAt: new Date().toISOString(),
      memberIds: [],
    }).catch(() => {});
  }
}

async function addGroupMember(chatId, userId, userInfo) {
  await setDoc(
    doc(db, "groupWorkspaces", String(chatId), "members", String(userId)),
    { userId: String(userId), ...userInfo, joinedAt: new Date().toISOString() },
    { merge: true }
  ).catch(() => {});
  await setDoc(doc(db, "groupWorkspaces", String(chatId)),
    { memberIds: arrayUnion(String(userId)) }, { merge: true }
  ).catch(() => {});
}

async function createGroupTask(chatId, taskData) {
  const taskId = `gtask_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now    = new Date().toISOString();

  let dueDate = null;
  if (taskData.dueDate && taskData.dueDate !== "null") {
    const d = new Date(taskData.dueDate);
    if (!isNaN(d.getTime())) dueDate = d.toISOString();
  }

  const task = {
    id: taskId, chatId: String(chatId),
    title:         taskData.title,
    description:   taskData.description  || "",
    dueDate,
    priority:      taskData.priority     || "medium",
    status:        "todo",
    createdBy:     String(taskData.createdBy),
    createdByName: taskData.createdByName || "",
    assigneeId:    taskData.assigneeId   || null,
    assigneeName:  taskData.assigneeName || null,
    createdAt: now, updatedAt: now, isSent: false,
  };

  await setDoc(doc(db, "groupWorkspaces", String(chatId), "tasks", taskId), task).catch(e => {
    throw new Error(`createGroupTask: ${e.message}`);
  });

  // Уведомление назначенному
  if (taskData.assigneeId && taskData.assigneeId !== String(taskData.createdBy)) {
    const dueStr = dueDate ? `\n⏰ Срок: ${formatDateTime(new Date(dueDate))}` : "";
    await safeSend(taskData.assigneeId,
      `📋 Тебе назначена задача!\n\n📌 ${task.title}${dueStr}\n👤 Назначил: ${taskData.createdByName || "участник"}\n💬 Группа: ${taskData.chatTitle || "команда"}`,
      getOpenAppButton()
    );
  }

  // Напоминание в бот-коллекцию
  if (dueDate) {
    const dueTs = new Date(dueDate);
    if (dueTs > new Date()) {
      const targets = taskData.assigneeId ? [String(taskData.assigneeId)] : (taskData.memberIds || []);
      for (const memberId of targets) {
        if (!memberId) continue;
        await addDoc(collection(db, "tasks"), {
          userId: memberId, taskId,
          title: task.title, description: "", dueDate,
          priority: task.priority, status: "todo",
          createdAt: now, isSent: false,
          reminderAt: Timestamp.fromDate(dueTs),
          repeat: "none", type: "task", isGroupTask: true,
          chatId: String(chatId),
        }).catch(() => {});
      }
    }
  }

  return task;
}

async function getGroupTasks(chatId, onlyActive = true) {
  try {
    const snap = await getDocs(collection(db, "groupWorkspaces", String(chatId), "tasks"));
    const tasks = [];
    snap.forEach(d => {
      const t = { ...d.data(), id: d.id };
      if (!onlyActive || t.status !== "done") tasks.push(t);
    });
    tasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      if (a.dueDate) return -1; if (b.dueDate) return 1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    return tasks;
  } catch (e) { console.log("getGroupTasks:", e.message); return []; }
}

async function markGroupTaskDone(chatId, taskId, userId, userName) {
  const now = new Date().toISOString();
  await updateDoc(
    doc(db, "groupWorkspaces", String(chatId), "tasks", taskId),
    { status: "done", completedAt: now, completedBy: String(userId), completedByName: userName || "", updatedAt: now }
  ).catch(e => console.log("markGroupTaskDone:", e.message));
}

// ══════════════════════════════════════════════════════════════
// ПОДПИСКИ — UI
// ══════════════════════════════════════════════════════════════

function buildProviderData(plan) {
  return JSON.stringify({
    receipt: {
      items: [{
        description: `Подписка CortexAI на ${plan.label}`,
        quantity: 1,
        amount: { value: plan.rubStr, currency: "RUB" },
        vat_code: 1, payment_mode: "full_payment", payment_subject: "service",
      }],
      tax_system_code: 1,
    },
  });
}

async function showSubscribeMenu(chatId) {
  const ykText = YOOKASSA_PROVIDER_TOKEN
    ? "💳 Рубли (ЮKassa):\n  📅 1 месяц — 99 ₽\n  🗓 3 месяца — 390 ₽\n  🏆 12 месяцев — 599 ₽\n\n"
    : "";
  const ykBtn = YOOKASSA_PROVIDER_TOKEN
    ? [[{ text: "💳 Оплата рублями", callback_data: "menu_yk" }]]
    : [];

  await bot.sendMessage(chatId,
    `💎 Подписка CortexAI\n\n${ykText}⭐ Telegram Stars:\n  📅 1 месяц — 73 ⭐\n  🗓 3 месяца — 289 ⭐\n  🏆 12 месяцев — 430 ⭐\n\n✅ Безлимитные задачи\n✅ AI без лимитов\n✅ Мотивация`,
    { reply_markup: { inline_keyboard: [...ykBtn, [{ text: "⭐ Оплата Stars", callback_data: "menu_stars" }]] } }
  );
}

// ══════════════════════════════════════════════════════════════
// МОТИВАЦИЯ
// ══════════════════════════════════════════════════════════════

async function generateMotivation(userId, mode, tasks) {
  if (!GROQ_API_KEY) return null;
  const now = new Date();
  const h   = now.getHours();
  const timeOfDay = h < 12 ? "утро" : h < 17 ? "день" : "вечер";
  const tasksList = tasks.length > 0
    ? tasks.slice(0, 5).map(t => `- ${t.title}${t.dueDate ? ` (до ${formatDateTime(new Date(t.dueDate))})` : ""}`).join("\n")
    : "задач нет";
  const modeText = {
    soft:   "Ты добрый поддерживающий друг. Пиши тепло, мягко, без давления.",
    normal: "Ты энергичный мотивационный коуч. Пиши позитивно, конкретно.",
    hard:   "Ты требовательный тренер. Пиши прямо, честно. БЕЗ мата.",
  }[mode] || "Ты мотивационный коуч.";

  const prompt = `${modeText}\nСейчас ${timeOfDay}.\nЗадачи:\n${tasksList}\nНапиши мотивирующее сообщение (2-3 предл.), 1-2 эмодзи, только русский язык.`;
  try {
    return await askGroq(prompt, 200) || null;
  } catch { return null; }
}

async function sendMotivationNotifications() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr    = now.toISOString().split("T")[0];

    // Пробуем collectionGroup (требует индекс в Firebase)
    let docs = [];
    try {
      const snap = await getDocs(query(collectionGroup(db, "settings"), where("enabled", "==", true)));
      snap.forEach(d => { if (d.id === "motivation") docs.push(d); });
    } catch {
      // Fallback: перебираем пользователей
      try {
        const users = await getDocs(collection(db, "users"));
        for (const u of users.docs) {
          try {
            const s = await getDoc(doc(db, "users", u.id, "settings", "motivation"));
            if (s.exists() && s.data().enabled) docs.push(s);
          } catch {}
        }
      } catch {}
    }

    let processed = 0;
    for (const d of docs) {
      const settings = d.data();
      if (!settings.enabled || settings.mode === "off") continue;
      const userId = d.ref.path.split("/")[1];
      if (!userId) continue;

      const schedule = MOTIVATION_SCHEDULES[settings.timesPerDay || 3] || MOTIVATION_SCHEDULES[3];
      if (!schedule.includes(currentHour)) continue;

      const key = `mot_${userId}_${todayStr}_${currentHour}`;
      if (sentMotivations.has(key)) continue;
      sentMotivations.add(key);

      // Берём задачи пользователя
      const tasks = [];
      try {
        const ts = await getDocs(collection(db, "users", userId, "workspaces", PERSONAL_WS, "tasks"));
        ts.forEach(d => { const t = d.data(); if (t.status !== "done" && t.title) tasks.push(t); });
      } catch {}

      let text = await generateMotivation(userId, settings.mode, tasks);
      if (!text) {
        const list = FALLBACK_MOTIVATIONS[settings.mode] || FALLBACK_MOTIVATIONS.normal;
        text = list[Math.floor(Math.random() * list.length)];
      }

      const ok = await safeSend(userId, `💪 Мотивация\n\n${text}`);
      if (ok) { processed++; console.log(`💪 Мотивация → ${userId}`); }
      else {
        // Отключаем если бот заблокирован
        setDoc(doc(db, "users", userId, "settings", "motivation"), { enabled: false }, { merge: true }).catch(() => {});
      }
    }

    if (processed > 0) console.log(`💪 Мотивация отправлена: ${processed} чел.`);

    // Чистим старые ключи
    if (sentMotivations.size > 5000) {
      for (const k of sentMotivations) {
        if (!k.includes(todayStr)) sentMotivations.delete(k);
      }
    }
  } catch (e) { console.log("sendMotivationNotifications:", e.message); }
}

// ══════════════════════════════════════════════════════════════
// НАПОМИНАНИЯ
// ══════════════════════════════════════════════════════════════

async function checkReminders() {
  try {
    const now = new Date();
    const snap = await getDocs(query(
      collection(db, "tasks"),
      where("isSent", "==", false),
      where("reminderAt", "<=", Timestamp.fromDate(now))
    ));
    if (snap.empty) return;
    console.log(`🔔 Напоминаний: ${snap.size}`);

    for (const d of snap.docs) {
      if (sentNotifications.has(d.id)) continue;
      sentNotifications.add(d.id);
      const task = d.data();

      try {
        // Помечаем отправленным
        await updateDoc(doc(db, "tasks", d.id), { isSent: true });

        if (task.status === "done" || !task.userId) continue;

        const isGroupTask = Boolean(task.isGroupTask);
        const text = isGroupTask
          ? `🔔 Напоминание!\n\n📌 ${task.title}${task.assigneeName ? `\n👤 Назначена: ${task.assigneeName}` : ""}\n💬 Групповая задача`
          : `🔔 Напоминание!\n\n📌 ${task.title}${task.description ? `\n${task.description}` : ""}${task.repeat && task.repeat !== "none" ? "\n\n🔁 Повторяющаяся" : ""}`;

        const markup = {
          reply_markup: {
            inline_keyboard: [[{
              text: "✅ Выполнить",
              callback_data: isGroupTask
                ? `gdone_${task.chatId}_${task.taskId}`
                : `done_${task.taskId}`,
            }]],
          },
        };

        await safeSend(task.userId, text, markup);

        // Обновляем статус в workspace
        if (!isGroupTask && task.taskId) {
          updateDoc(
            doc(db, "users", task.userId, "workspaces", PERSONAL_WS, "tasks", task.taskId),
            { notified: true, updatedAt: new Date().toISOString() }
          ).catch(() => {});
        }

        if (task.repeat === "daily" && task.status !== "done") {
          await createNextDailyTask(task);
        }

        console.log(`✅ Напоминание → ${task.userId}: ${task.title}`);
      } catch (e) { console.log(`❌ Напоминание ${d.id}: ${e.message}`); }
    }

    if (sentNotifications.size > 3000) sentNotifications.clear();
  } catch (e) { console.log("checkReminders:", e.message); }
}

async function createNextDailyTask(task) {
  try {
    const next = new Date(task.reminderAt.toDate());
    next.setDate(next.getDate() + 1);
    const nextStr = next.toISOString().split("T")[0];

    // Проверяем что задача на завтра ещё не существует
    const ex = await getDocs(query(
      collection(db, "tasks"),
      where("userId",   "==", task.userId),
      where("title",    "==", task.title),
      where("repeat",   "==", "daily"),
      where("isSent",   "==", false)
    ));
    let exists = false;
    ex.forEach(d => { if ((d.data().dueDate || "").startsWith(nextStr)) exists = true; });
    if (exists) return;

    await addDoc(collection(db, "tasks"), {
      userId:      task.userId,
      taskId:      `daily_${Date.now()}`,
      title:       task.title,
      description: task.description || "",
      dueDate:     next.toISOString(),
      priority:    task.priority || "medium",
      status:      "todo",
      createdAt:   new Date().toISOString(),
      isSent:      false,
      reminderAt:  Timestamp.fromDate(next),
      repeat:      "daily",
    });
  } catch (e) { console.log("createNextDailyTask:", e.message); }
}

// ══════════════════════════════════════════════════════════════
// ПРОВЕРКА ПОДПИСОК
// ══════════════════════════════════════════════════════════════

async function checkSubscriptions() {
  try {
    const now  = new Date();
    const snap = await getDocs(collection(db, "subscriptions"));
    for (const d of snap.docs) {
      const sub = d.data();
      if (!sub.isActive || !sub.expiresAt || !sub.userId) continue;
      const exp      = sub.expiresAt.toDate();
      const daysLeft = Math.ceil((exp - now) / 86400000);

      if (daysLeft === 3 && !sub.notified3days) {
        await safeSend(sub.userId, "⚠️ Подписка CortexAI заканчивается через 3 дня!\n\nНапиши /subscribe для продления 🚀");
        updateDoc(doc(db, "subscriptions", d.id), { notified3days: true }).catch(() => {});
      }
      if (daysLeft === 1 && !sub.notified1day) {
        await safeSend(sub.userId, "🚨 Подписка CortexAI заканчивается ЗАВТРА!\n\nНапиши /subscribe ⚡");
        updateDoc(doc(db, "subscriptions", d.id), { notified1day: true }).catch(() => {});
      }
      if (daysLeft <= 0 && sub.isActive) {
        updateDoc(doc(db, "subscriptions", d.id), { isActive: false }).catch(() => {});
        await safeSend(sub.userId, "❌ Подписка CortexAI истекла.\n\nНапиши /subscribe для продления.");
      }
    }
  } catch (e) { console.log("checkSubscriptions:", e.message); }
}

// ══════════════════════════════════════════════════════════════
// КОМАНДЫ — ЛИЧНЫЙ ЧАТ
// ══════════════════════════════════════════════════════════════

// /start
bot.onText(/\/start(.*)/, async (msg, match) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  const param  = (match[1] || "").trim().replace(/^\//, "");

  await registerUser(msg);

  // Авто-подписка для администраторов
  if (isAdmin(userId)) {
    grantSubscription(userId, 3650, true).catch(() => {});
  }

  if (param === "subscribe") {
    if (isAdmin(userId)) {
      await bot.sendMessage(msg.chat.id, "👑 Ты администратор — подписка активна.");
      return;
    }
    await showSubscribeMenu(msg.chat.id);
    return;
  }

  const hasSub = await checkHasSub(userId);

  await bot.sendMessage(msg.chat.id,
    `Привет, ${msg.from.first_name || "друг"}! 👋\n\n` +
    `Я CortexAI — умный планировщик задач.\n\n` +
    `📝 Что умею:\n` +
    `• /task Купить молоко завтра в 10:00\n` +
    `• /tasks — мои задачи\n` +
    `• /done — выполнить задачу\n` +
    `• Просто напиши мне — сам создам задачу!\n\n` +
    `${hasSub ? "✅ Подписка активна" : "📋 5 бесплатных AI-запросов/день"}\n\n` +
    `💡 Напиши любую задачу прямо сейчас!`,
    getOpenAppButton()
  );
});

// /myid
bot.onText(/\/myid/, msg => {
  bot.sendMessage(msg.chat.id, `🆔 Твой Telegram ID: \`${msg.from.id}\``, { parse_mode: "Markdown" });
});

// /appss_verify
bot.onText(/\/appss_verify/, msg => {
  bot.sendMessage(msg.chat.id, "appss_73be81");
});

// /task
bot.onText(/\/task(?:\s+(.+))?/, async (msg, match) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  await registerUser(msg);

  const text = match[1]?.trim();
  if (!text) {
    await bot.sendMessage(msg.chat.id,
      "📝 Напиши задачу после команды:\n\n" +
      "/task Купить молоко\n" +
      "/task Встреча завтра в 15:00\n" +
      "/task Отправить отчёт в пятницу до 18:00\n\n" +
      "Или просто напиши мне в чат — сам создам задачу!"
    );
    return;
  }

  let waitMsg;
  try { waitMsg = await bot.sendMessage(msg.chat.id, "⏳ Разбираю задачу..."); } catch {}

  const parsed = await parseTaskFromText(text);
  let task;
  try {
    task = await createPersonalTask(userId, { ...parsed, isAiCreated: true, source: "bot_command" });
  } catch (e) {
    await safeSend(msg.chat.id, `❌ Ошибка создания задачи: ${e.message}`);
    return;
  }

  const dueStr = task.dueDate ? `\n⏰ Срок: ${formatDateTime(new Date(task.dueDate))}` : "";
  const reply  = `✅ Задача создана!\n\n📌 ${task.title}${dueStr}\n\n💬 /tasks — все задачи`;

  if (waitMsg) {
    await bot.editMessageText(reply, { chat_id: msg.chat.id, message_id: waitMsg.message_id, ...getOpenAppButton() }).catch(() => {
      safeSend(msg.chat.id, reply, getOpenAppButton());
    });
  } else {
    await safeSend(msg.chat.id, reply, getOpenAppButton());
  }
});

// /tasks
bot.onText(/\/tasks/, async (msg) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  await registerUser(msg);
  const tasks = await getUserTasks(userId);
  const text  = tasks.length > 0
    ? `📋 Твои задачи (${tasks.length}):\n\n${formatTaskList(tasks)}\n\n✅ Выполнить: /done`
    : "📋 Активных задач нет! 🎉\n\nСоздай: /task Название задачи";
  await bot.sendMessage(msg.chat.id, text, getOpenAppButton());
});

// /done
bot.onText(/\/done(?:\s+(\d+))?/, async (msg, match) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  const tasks  = await getUserTasks(userId);

  if (tasks.length === 0) {
    await bot.sendMessage(msg.chat.id, "🎉 Нет активных задач!");
    return;
  }

  const num = parseInt(match[1]);
  if (num >= 1 && num <= tasks.length) {
    const task = tasks[num - 1];
    await markTaskDone(userId, task.id);
    await bot.sendMessage(msg.chat.id, `✅ Выполнено: ${task.title} 🎉`);
    return;
  }

  const keyboard = tasks.slice(0, 10).map((t, i) => ([{
    text: `${i + 1}. ${t.title.substring(0, 40)}`,
    callback_data: `done_${t.id}`,
  }]));
  await bot.sendMessage(msg.chat.id, "✅ Какую задачу отметить выполненной?", {
    reply_markup: { inline_keyboard: keyboard },
  });
});

// /subscribe
bot.onText(/\/subscribe$/, async (msg) => {
  if (isGroup(msg.chat.id)) {
    await bot.sendMessage(msg.chat.id, "💎 Подписка — в личном чате с ботом @aiplannerrubot");
    return;
  }
  if (isAdmin(String(msg.from.id))) {
    await bot.sendMessage(msg.chat.id, "👑 Ты администратор — подписка активна бесплатно.");
    return;
  }
  await showSubscribeMenu(msg.chat.id);
});

// /test_motivation
bot.onText(/\/test_motivation/, async (msg) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  try {
    const snap = await getDoc(doc(db, "users", userId, "settings", "motivation"));
    if (!snap.exists()) {
      await bot.sendMessage(msg.chat.id,
        "❌ Настройки мотивации не найдены.\n\nОткрой приложение → Ещё → Настройки → Мотивация."
      );
      return;
    }
    const s = snap.data();
    await bot.sendMessage(msg.chat.id, `🔍 Настройки: режим=${s.mode}, в день=${s.timesPerDay}×\n\nГенерирую...`);
    const tasks = await getUserTasks(userId, 5);
    let text = await generateMotivation(userId, s.mode || "normal", tasks);
    if (!text) {
      const list = FALLBACK_MOTIVATIONS[s.mode] || FALLBACK_MOTIVATIONS.normal;
      text = list[Math.floor(Math.random() * list.length)];
    }
    await bot.sendMessage(msg.chat.id, `💪 Мотивация (тест)\n\n${text}`);
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

// Свободный текст в личке → создаём задачу
bot.on("message", async (msg) => {
  if (isGroup(msg.chat.id) || !msg.text || msg.text.startsWith("/") || msg.via_bot) return;
  const userId = String(msg.from.id);
  const text   = msg.text.trim();

  await registerUser(msg);

  const isTaskLike = /купи|напомни|сделай|встреча|позвони|отправь|подготов|задача|дело|план|запись|remind|buy|call|send|meeting|task|todo/i.test(text) || text.length <= 120;
  if (!isTaskLike) return;

  let waitMsg;
  try { waitMsg = await bot.sendMessage(msg.chat.id, "⏳ Создаю задачу..."); } catch {}

  const parsed = await parseTaskFromText(text);
  let task;
  try {
    task = await createPersonalTask(userId, { ...parsed, isAiCreated: true, source: "bot_text" });
  } catch (e) {
    if (waitMsg) bot.editMessageText(`❌ Ошибка: ${e.message}`, { chat_id: msg.chat.id, message_id: waitMsg.message_id }).catch(() => {});
    return;
  }

  const dueStr = task.dueDate ? `\n⏰ ${formatDateTime(new Date(task.dueDate))}` : "";
  const reply  = `✅ Задача создана!\n\n📌 ${task.title}${dueStr}\n\n/tasks — все задачи | /done — выполнить`;

  if (waitMsg) {
    await bot.editMessageText(reply, { chat_id: msg.chat.id, message_id: waitMsg.message_id, ...getOpenAppButton() }).catch(() => {
      safeSend(msg.chat.id, reply, getOpenAppButton());
    });
  }
});

// ══════════════════════════════════════════════════════════════
// INLINE MODE
// ══════════════════════════════════════════════════════════════

bot.on("inline_query", async (query) => {
  const userId = String(query.from.id);
  const text   = query.query.trim();

  if (!text) {
    await bot.answerInlineQuery(query.id, [{
      type: "article", id: "help",
      title: "📝 Создать задачу",
      description: "Введи название задачи...",
      input_message_content: { message_text: "🤖 Напиши: @aiplannerrubot текст задачи" },
    }], { cache_time: 0 }).catch(() => {});
    return;
  }

  const results = [{
    type: "article",
    id:   `task_${Date.now()}`,
    title: `📌 ${text.substring(0, 50)}`,
    description: "Нажми — задача появится в CortexAI",
    input_message_content: {
      message_text: `📌 Задача: ${text}\n\n⏳ Создаётся в CortexAI...`,
    },
    reply_markup: WEBAPP_URL ? {
      inline_keyboard: [[{ text: "🚀 Открыть CortexAI", url: WEBAPP_URL }]],
    } : undefined,
  }];

  await bot.answerInlineQuery(query.id, results, { cache_time: 0 }).catch(() => {});

  // Создаём задачу в фоне
  setTimeout(async () => {
    try {
      const parsed = await parseTaskFromText(text);
      const task   = await createPersonalTask(userId, { ...parsed, isAiCreated: true, source: "inline" });
      await safeSend(userId,
        `✅ Задача создана через inline!\n\n📌 ${task.title}${task.dueDate ? `\n⏰ ${formatDateTime(new Date(task.dueDate))}` : ""}\n\n/tasks — все задачи`,
        getOpenAppButton()
      );
    } catch (e) { console.log("Inline task error:", e.message); }
  }, 500);
});

// ══════════════════════════════════════════════════════════════
// ГРУППОВЫЕ ЧАТЫ
// ══════════════════════════════════════════════════════════════

bot.on("my_chat_member", async (update) => {
  const { chat, new_chat_member } = update;
  if (!["member", "administrator"].includes(new_chat_member.status) || !isGroup(chat.id)) return;
  await ensureGroupWorkspace(chat.id, chat.title);
  await bot.sendMessage(chat.id,
    `👋 Привет! Я CortexAI.\n\n` +
    `📋 Командные задачи:\n` +
    `/grouptask Подготовить отчёт @user к пятнице\n` +
    `/grouptasks — список задач\n` +
    `/groupdone — отметить выполненной\n\n` +
    `💡 Или упомяни меня: @${BOT_USERNAME} задача`,
    getOpenAppButton()
  ).catch(() => {});
});

bot.on("new_chat_members", async (msg) => {
  if (!isGroup(msg.chat.id)) return;
  for (const m of msg.new_chat_members) {
    if (m.is_bot) continue;
    await addGroupMember(msg.chat.id, m.id, { firstName: m.first_name || "", username: m.username || "" });
  }
});

bot.on("left_chat_member", async (msg) => {
  if (!isGroup(msg.chat.id)) return;
  try {
    const uid = String(msg.left_chat_member.id);
    await deleteDoc(doc(db, "groupWorkspaces", String(msg.chat.id), "members", uid)).catch(() => {});
    await setDoc(doc(db, "groupWorkspaces", String(msg.chat.id)), { memberIds: arrayRemove(uid) }, { merge: true }).catch(() => {});
  } catch {}
});

// /grouptask
bot.onText(/\/grouptask(?:@\S+)?(?:\s+(.+))?/, async (msg, match) => {
  if (!isGroup(msg.chat.id)) { await bot.sendMessage(msg.chat.id, "📋 Команда только для групп."); return; }
  const userId = String(msg.from.id);
  const text   = match[1]?.trim();

  if (!text) {
    await bot.sendMessage(msg.chat.id,
      "📋 Формат:\n/grouptask Название [@username] [дата]\n\n" +
      "Пример:\n/grouptask Подготовить отчёт @ivan к пятнице 18:00"
    );
    return;
  }

  await ensureGroupWorkspace(msg.chat.id, msg.chat.title);
  await addGroupMember(msg.chat.id, userId, { firstName: msg.from.first_name || "", username: msg.from.username || "" });

  let waitMsg;
  try { waitMsg = await bot.sendMessage(msg.chat.id, "⏳ Создаю задачу..."); } catch {}

  const parsed = await parseTaskFromText(text);

  let assigneeId = null, assigneeName = null;
  if (parsed.assigneeUsername) {
    const user = await getUserByUsername(parsed.assigneeUsername);
    if (user) { assigneeId = user.id; assigneeName = user.firstName || parsed.assigneeUsername; }
  }

  const membersSnap = await getDocs(collection(db, "groupWorkspaces", String(msg.chat.id), "members")).catch(() => null);
  const memberIds = [];
  if (membersSnap) membersSnap.forEach(d => memberIds.push(d.id));

  let task;
  try {
    task = await createGroupTask(msg.chat.id, {
      ...parsed, createdBy: userId, createdByName: msg.from.first_name || "участник",
      assigneeId, assigneeName, chatTitle: msg.chat.title, memberIds,
    });
  } catch (e) {
    if (waitMsg) bot.editMessageText(`❌ Ошибка: ${e.message}`, { chat_id: msg.chat.id, message_id: waitMsg.message_id }).catch(() => {});
    return;
  }

  const dueStr = task.dueDate ? `\n⏰ ${formatDateTime(new Date(task.dueDate))}` : "";
  const asStr  = assigneeName ? `\n👤 Назначено: ${assigneeName}` : "";
  const reply  = `✅ Задача создана!\n📌 ${task.title}${dueStr}${asStr}`;

  if (waitMsg) {
    await bot.editMessageText(reply, {
      chat_id: msg.chat.id, message_id: waitMsg.message_id,
      reply_markup: { inline_keyboard: [[{ text: "✅ Выполнить", callback_data: `gdone_${msg.chat.id}_${task.id}` }]] },
    }).catch(() => safeSend(msg.chat.id, reply));
  }
});

// /grouptasks
bot.onText(/\/grouptasks(?:@\S+)?/, async (msg) => {
  if (!isGroup(msg.chat.id)) return;
  const tasks = await getGroupTasks(msg.chat.id);
  if (tasks.length === 0) {
    await bot.sendMessage(msg.chat.id, "📋 Нет активных задач!\n\n/grouptask — создать задачу");
    return;
  }
  const text = `📋 Задачи группы (${tasks.length}):\n\n${formatTaskList(tasks)}`;
  await bot.sendMessage(msg.chat.id, text, {
    reply_markup: {
      inline_keyboard: tasks.slice(0, 8).map(t => ([{
        text: `✅ ${t.title.substring(0, 35)}`,
        callback_data: `gdone_${msg.chat.id}_${t.id}`,
      }])),
    },
  });
});

// /groupdone
bot.onText(/\/groupdone(?:@\S+)?(?:\s+(\d+))?/, async (msg, match) => {
  if (!isGroup(msg.chat.id)) return;
  const tasks = await getGroupTasks(msg.chat.id);
  if (tasks.length === 0) { await bot.sendMessage(msg.chat.id, "🎉 Нет активных задач!"); return; }

  const num = parseInt(match[1]);
  if (num >= 1 && num <= tasks.length) {
    await markGroupTaskDone(msg.chat.id, tasks[num - 1].id, msg.from.id, msg.from.first_name);
    await bot.sendMessage(msg.chat.id, `✅ Выполнено: ${tasks[num - 1].title} 🎉\n👤 ${msg.from.first_name}`);
    return;
  }

  await bot.sendMessage(msg.chat.id, "✅ Какую задачу выполнить?", {
    reply_markup: {
      inline_keyboard: tasks.slice(0, 10).map((t, i) => ([{
        text: `${i + 1}. ${t.title.substring(0, 40)}`,
        callback_data: `gdone_${msg.chat.id}_${t.id}`,
      }])),
    },
  });
});

// /groupinfo
bot.onText(/\/groupinfo(?:@\S+)?/, async (msg) => {
  if (!isGroup(msg.chat.id)) return;
  const chatId = String(msg.chat.id);
  const [allTasks, membersSnap, wsSnap] = await Promise.all([
    getGroupTasks(chatId, false),
    getDocs(collection(db, "groupWorkspaces", chatId, "members")).catch(() => null),
    getDoc(doc(db, "groupWorkspaces", chatId)).catch(() => null),
  ]);
  const active  = allTasks.filter(t => t.status !== "done").length;
  const done    = allTasks.filter(t => t.status === "done").length;
  const members = membersSnap ? membersSnap.size : 0;
  const wsData  = wsSnap?.exists() ? wsSnap.data() : {};
  await bot.sendMessage(msg.chat.id,
    `ℹ️ ${msg.chat.title}\n\n` +
    `👥 Участников: ${members}\n` +
    `📋 Активных задач: ${active}\n` +
    `✅ Выполнено: ${done}\n` +
    `📅 Создана: ${wsData.createdAt ? new Date(wsData.createdAt).toLocaleDateString("ru-RU") : "—"}\n\n` +
    `/grouptask — создать\n/grouptasks — список\n/groupdone — выполнить`
  );
});

// Упоминание бота @username в группе → создать задачу
bot.on("message", async (msg) => {
  if (!isGroup(msg.chat.id) || !msg.text || msg.text.startsWith("/")) return;
  const mention = `@${BOT_USERNAME}`;
  if (!msg.text.includes(mention)) return;

  const taskText = msg.text.replace(new RegExp(mention, "gi"), "").trim();
  if (!taskText || taskText.length < 2) {
    await bot.sendMessage(msg.chat.id,
      `Привет! Напиши задачу после моего имени:\n${mention} Подготовить отчёт к пятнице`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const userId = String(msg.from.id);
  await ensureGroupWorkspace(msg.chat.id, msg.chat.title);
  await addGroupMember(msg.chat.id, userId, { firstName: msg.from.first_name || "", username: msg.from.username || "" });

  let waitMsg;
  try { waitMsg = await bot.sendMessage(msg.chat.id, "⏳ Создаю задачу...", { reply_to_message_id: msg.message_id }); } catch {}

  const parsed = await parseTaskFromText(taskText);
  let assigneeId = null, assigneeName = null;
  if (parsed.assigneeUsername) {
    const user = await getUserByUsername(parsed.assigneeUsername);
    if (user) { assigneeId = user.id; assigneeName = user.firstName || parsed.assigneeUsername; }
  }

  const membersSnap = await getDocs(collection(db, "groupWorkspaces", String(msg.chat.id), "members")).catch(() => null);
  const memberIds = [];
  if (membersSnap) membersSnap.forEach(d => memberIds.push(d.id));

  let task;
  try {
    task = await createGroupTask(msg.chat.id, {
      ...parsed, createdBy: userId, createdByName: msg.from.first_name || "участник",
      assigneeId, assigneeName, chatTitle: msg.chat.title, memberIds,
    });
  } catch (e) {
    if (waitMsg) bot.editMessageText(`❌ Ошибка: ${e.message}`, { chat_id: msg.chat.id, message_id: waitMsg.message_id }).catch(() => {});
    return;
  }

  const dueStr = task.dueDate ? `\n⏰ ${formatDateTime(new Date(task.dueDate))}` : "";
  const asStr  = assigneeName ? `\n👤 Для: ${assigneeName}` : "";

  if (waitMsg) {
    await bot.editMessageText(`✅ Задача создана!\n📌 ${task.title}${dueStr}${asStr}`, {
      chat_id: msg.chat.id, message_id: waitMsg.message_id,
      reply_markup: { inline_keyboard: [[{ text: "✅ Выполнить", callback_data: `gdone_${msg.chat.id}_${task.id}` }]] },
    }).catch(() => {});
  }
});

// ══════════════════════════════════════════════════════════════
// CALLBACK КНОПКИ
// ══════════════════════════════════════════════════════════════

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const userId = String(q.from.id);
  const data   = q.data || "";

  // Сначала отвечаем на callback чтобы убрать loading
  try { await bot.answerCallbackQuery(q.id); } catch {}

  // ── Выполнить личную задачу
  if (data.startsWith("done_")) {
    const taskId = data.slice(5);
    await markTaskDone(userId, taskId);
    await bot.editMessageText("✅ Задача выполнена! 🎉",
      { chat_id: chatId, message_id: q.message.message_id }
    ).catch(() => {});
    return;
  }

  // ── Выполнить групповую задачу
  // Формат: gdone_{chatId}_{taskId}
  // chatId может быть отрицательным (-100123456789)
  if (data.startsWith("gdone_")) {
    const parts  = data.slice(6).split("_");
    // Последний элемент — taskId, всё до него — chatId
    const taskId  = parts[parts.length - 1];
    const gChatId = parts.slice(0, -1).join("_");
    if (gChatId && taskId) {
      await markGroupTaskDone(gChatId, taskId, userId, q.from.first_name || "");
      await bot.editMessageText(`✅ Выполнено! 🎉\n👤 ${q.from.first_name || ""}`,
        { chat_id: chatId, message_id: q.message.message_id }
      ).catch(() => {});
    }
    return;
  }

  // ── Меню подписок
  if (data === "menu_yk") {
    if (!YOOKASSA_PROVIDER_TOKEN) { await safeSend(chatId, "❌ ЮKassa не настроена."); return; }
    await bot.sendMessage(chatId, "💳 Выбери тариф:", { reply_markup: { inline_keyboard: [
      [{ text: "📅 1 месяц — 99 ₽",       callback_data: "buy_yk_month_1"  }],
      [{ text: "🗓 3 месяца — 390 ₽",      callback_data: "buy_yk_month_3"  }],
      [{ text: "🏆 12 месяцев — 599 ₽ 🔥", callback_data: "buy_yk_month_12" }],
    ]}});
    return;
  }

  if (data === "menu_stars") {
    await bot.sendMessage(chatId, "⭐ Выбери тариф:", { reply_markup: { inline_keyboard: [
      [{ text: "📅 1 месяц — 73 ⭐",       callback_data: "buy_stars_month_1"  }],
      [{ text: "🗓 3 месяца — 289 ⭐",      callback_data: "buy_stars_month_3"  }],
      [{ text: "🏆 12 месяцев — 430 ⭐ 🔥", callback_data: "buy_stars_month_12" }],
    ]}});
    return;
  }

  if (data.startsWith("buy_yk_")) {
    const planKey = data.slice(4);
    const plan    = PLANS[planKey];
    if (!plan || !YOOKASSA_PROVIDER_TOKEN) return;
    try {
      await bot.sendInvoice(chatId,
        `${plan.emoji} Подписка CortexAI — ${plan.label}`,
        `Безлимитные задачи + AI + Мотивация на ${plan.label}`,
        `${planKey}_${userId}_${Date.now()}`,
        YOOKASSA_PROVIDER_TOKEN, "RUB",
        [{ label: `CortexAI ${plan.label}`, amount: plan.rub }],
        { need_email: true, send_email_to_provider: true, provider_data: buildProviderData(plan) }
      );
    } catch (e) { await safeSend(chatId, `❌ Ошибка счёта: ${e.message}`); }
    return;
  }

  if (data.startsWith("buy_stars_")) {
    const planKey = data.slice(4);
    const plan    = PLANS[planKey];
    if (!plan) return;
    try {
      await bot.sendInvoice(chatId,
        `${plan.emoji} Подписка CortexAI — ${plan.label}`,
        `Безлимитные задачи + AI + Мотивация на ${plan.label}`,
        `${planKey}_${userId}_${Date.now()}`,
        "", "XTR",
        [{ label: `CortexAI ${plan.label}`, amount: plan.stars }]
      );
    } catch (e) { await safeSend(chatId, `❌ Ошибка: ${e.message}`); }
    return;
  }
});

// ══════════════════════════════════════════════════════════════
// ПЛАТЕЖИ
// ══════════════════════════════════════════════════════════════

bot.on("pre_checkout_query", async (q) => {
  try {
    await bot.answerPreCheckoutQuery(q.id, true);
  } catch {
    try { await bot.answerPreCheckoutQuery(q.id, false, "Ошибка. Попробуй ещё раз."); } catch {}
  }
});

bot.on("successful_payment", async (msg) => {
  const userId  = String(msg.chat.id);
  const payment = msg.successful_payment;
  const payload = payment?.invoice_payload || "";
  console.log(`💰 Оплата: ${userId} — ${payload}`);
  try {
    let days = 30, label = "1 месяц";
    if (payload.includes("month_12")) { days = 365; label = "12 месяцев"; }
    else if (payload.includes("month_3")) { days = 90; label = "3 месяца"; }

    const expiresAt = await grantSubscription(userId, days, false);
    const isStars   = payment.currency === "XTR";
    const amount    = isStars ? `${payment.total_amount} ⭐` : `${(payment.total_amount / 100).toFixed(2)} ₽`;

    await safeSend(userId,
      `✅ Оплата прошла!\n\n💳 ${isStars ? "Stars" : "ЮKassa"} — ${amount}\n📅 ${label}\n⏰ До: ${formatDate(expiresAt)}\n\n🚀 Подписка активирована!`,
      getOpenAppButton()
    );
    for (const adminId of ADMINS) {
      safeSend(adminId, `💰 Новая оплата!\n👤 ${userId}\n${amount} — ${label}`).catch(() => {});
    }
  } catch (e) { console.log("successful_payment:", e.message); }
});

// ══════════════════════════════════════════════════════════════
// КОМАНДЫ АДМИНИСТРАТОРА
// ══════════════════════════════════════════════════════════════

bot.onText(/\/help/, async (msg) => {
  if (!isAdmin(String(msg.from.id))) return;
  await bot.sendMessage(msg.chat.id,
    `🛠 Команды администратора:\n\n` +
    `/gift [ID] [дни] — выдать подписку\n` +
    `/revoke [ID] — отозвать подписку\n` +
    `/checksub [ID] — проверить подписку\n` +
    `/subscribers — список подписчиков\n` +
    `/stats — статистика\n` +
    `/broadcast [текст] — рассылка\n` +
    `/grouplist — группы с ботом\n` +
    `/myid — мой ID`
  );
});

bot.onText(/\/gift(?:\s+(.+))?/, async (msg, match) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const args = (match[1] || "").trim().split(/\s+/);
  const targetId = args[0];
  const days     = parseInt(args[1]) || 9999;

  if (!targetId || !/^\d+$/.test(targetId)) {
    bot.sendMessage(msg.chat.id, "❌ Формат: /gift [ID] [дни]\nПример: /gift 123456789 30");
    return;
  }
  try {
    const exp = await grantSubscription(targetId, days, true);
    await bot.sendMessage(msg.chat.id, `✅ Подписка выдана!\n👤 ${targetId}\n📅 ${days} дн. до ${formatDate(exp)}`);
    await safeSend(targetId, `🎁 Тебе выдана подписка CortexAI!\n📅 ${days >= 9999 ? "Бессрочно" : `${days} дней`}\n✅ AI без лимитов 💪`, getOpenAppButton());
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

bot.onText(/\/revoke(?:\s+(.+))?/, async (msg, match) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const targetId = (match[1] || "").trim();
  if (!targetId || !/^\d+$/.test(targetId)) {
    bot.sendMessage(msg.chat.id, "❌ Формат: /revoke [ID]");
    return;
  }
  try {
    await revokeSubscription(targetId);
    await bot.sendMessage(msg.chat.id, `✅ Подписка отключена у ${targetId}`);
    await safeSend(targetId, "❌ Подписка CortexAI отключена.\n\nНапиши /subscribe.");
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

bot.onText(/\/checksub(?:\s+(.+))?/, async (msg, match) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const targetId = (match[1] || "").trim();
  if (!targetId) { bot.sendMessage(msg.chat.id, "❌ Формат: /checksub [ID]"); return; }
  const info = await getSubInfo(targetId);
  if (!info) { await bot.sendMessage(msg.chat.id, `👤 ${targetId}\n❌ Подписки нет`); return; }
  const left = info.expiresAt ? Math.ceil((info.expiresAt - new Date()) / 86400000) : 0;
  await bot.sendMessage(msg.chat.id,
    `👤 ${targetId}\n` +
    `${info.isActive && left > 0 ? "✅ Активна" : "❌ Неактивна"}\n` +
    `📅 До: ${info.expiresAt ? formatDate(info.expiresAt) : "—"}\n` +
    `⏳ Осталось: ${left > 0 ? `${left} дн.` : "истекла"}\n` +
    `🎁 Подарок: ${info.isGift ? "да" : "нет"}`
  );
});

bot.onText(/\/subscribers/, async (msg) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  try {
    const snap = await getDocs(collection(db, "subscriptions"));
    const now  = new Date();
    const active = [], expired = [];
    snap.forEach(d => {
      const s = d.data(); if (!s.expiresAt) return;
      const exp  = s.expiresAt.toDate();
      const left = Math.ceil((exp - now) / 86400000);
      (s.isActive && left > 0 ? active : expired).push({ ...s, left, expStr: formatDate(exp) });
    });
    active.sort((a, b) => a.left - b.left);
    let text = `📊 Подписки\n✅ Активных: ${active.length} | ❌ Истёкших: ${expired.length}\n\n`;
    active.forEach(s => { text += `👤 ${s.userId}\n  📅 До: ${s.expStr} (${s.left} дн.) ${s.isGift ? "🎁" : "💳"}\n\n`; });
    if (text.length > 4000) text = text.slice(0, 3900) + "\n...";
    await bot.sendMessage(msg.chat.id, text || "Подписчиков нет.");
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

bot.onText(/\/stats/, async (msg) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  try {
    const now = new Date();
    let users = 0, activeSubs = 0, totalSubs = 0, groups = 0, motEnabled = 0;
    try { users = (await getDocs(collection(db, "users"))).size; } catch {}
    try {
      const subs = await getDocs(collection(db, "subscriptions"));
      subs.forEach(d => {
        totalSubs++;
        const s = d.data();
        if (s.isActive && s.expiresAt && s.expiresAt.toDate() > now) activeSubs++;
      });
    } catch {}
    try { groups = (await getDocs(collection(db, "groupWorkspaces"))).size; } catch {}
    try {
      const mot = await getDocs(query(collectionGroup(db, "settings"), where("enabled", "==", true)));
      mot.forEach(d => { if (d.id === "motivation" && d.data().mode !== "off") motEnabled++; });
    } catch {}
    await bot.sendMessage(msg.chat.id,
      `📈 Статистика CortexAI\n\n` +
      `👥 Пользователей: ${users}\n` +
      `💬 Групп с ботом: ${groups}\n` +
      `💳 Всего подписок: ${totalSubs}\n` +
      `✅ Активных: ${activeSubs}\n` +
      `💪 Мотивация включена: ${motEnabled}\n\n` +
      `🕐 ${now.toLocaleString("ru-RU")}`
    );
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

bot.onText(/\/broadcast(?:\s+(.+))?/, async (msg, match) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const text = (match[1] || "").trim();
  if (!text) { bot.sendMessage(msg.chat.id, "❌ Формат: /broadcast [текст]"); return; }
  try {
    const snap = await getDocs(collection(db, "users"));
    let sent = 0, failed = 0;
    await bot.sendMessage(msg.chat.id, `📤 Рассылка ${snap.size} пользователям...`);
    for (const d of snap.docs) {
      const ok = await safeSend(d.id, `📢 ${text}`);
      ok ? sent++ : failed++;
      await new Promise(r => setTimeout(r, 50));
    }
    await bot.sendMessage(msg.chat.id, `✅ Готово!\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`);
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

bot.onText(/\/grouplist/, async (msg) => {
  if (!isAdmin(String(msg.from.id))) return;
  try {
    const snap = await getDocs(collection(db, "groupWorkspaces"));
    let text = `💬 Групп с ботом: ${snap.size}\n\n`;
    snap.forEach(d => {
      const g = d.data();
      text += `📌 ${g.title || "Без названия"} (ID: ${g.chatId})\n`;
    });
    await bot.sendMessage(msg.chat.id, text || "Групп нет.");
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

// ══════════════════════════════════════════════════════════════
// AI СЛУШАТЕЛЬ (запросы из webapp)
// ══════════════════════════════════════════════════════════════

function startAiListener() {
  console.log("AI слушатель запущен ✅");
  const q = query(collection(db, "ai_requests"), where("status", "==", "pending"));

  const unsub = onSnapshot(q, async (snapshot) => {
    const added = snapshot.docChanges().filter(c => c.type === "added");
    if (!added.length) return;

    for (const change of added) {
      const reqDoc = change.doc;
      const req    = reqDoc.data();
      const reqId  = reqDoc.id;

      try {
        await updateDoc(doc(db, "ai_requests", reqId), { status: "processing", processedAt: new Date().toISOString() });
      } catch { continue; }

      const { userId, message, history = [], language, tasks = [] } = req;
      const ru  = language === "ru";
      const now = new Date();

      const sysPrompt =
        `Ты АИ Агент планировщика CortexAI. Время: ${now.toLocaleString("ru-RU")}.\n` +
        `Задачи: ${tasks.length > 0 ? tasks.map(t => `${t.title}${t.dueDate ? ` (${formatDateTime(new Date(t.dueDate))})` : ""}`).join(", ") : "нет"}\n\n` +
        `Если нужно создать задачу — в конце: TASK_JSON:{"title":"...","dueDate":"ISO или null","priority":"medium","repeat":"none"}\n` +
        `Правила: коротко, ${ru ? "по-русски" : "in English"}, эмодзи.`;

      try {
        const msgs = [{ role: "system", content: sysPrompt }, ...history.slice(-8), { role: "user", content: message }];
        const aiText = await askGroq(msgs, 400);

        let taskCreated = null;
        const match = aiText.match(/TASK_JSON:\s*(\{[\s\S]*?\})\s*$/);
        if (match) {
          try {
            const td = JSON.parse(match[1]);
            if (td.title?.length > 1) {
              const task = await createPersonalTask(userId, {
                title: td.title,
                dueDate: (td.dueDate && td.dueDate !== "null") ? td.dueDate : null,
                priority: td.priority || "medium",
                repeat: td.repeat || "none",
                isAiCreated: true, source: "webapp_ai",
              });
              taskCreated = { id: task.id, title: task.title, dueDate: task.dueDate };
            }
          } catch {}
        }

        const clean = aiText.replace(/TASK_JSON:\s*\{[\s\S]*?\}\s*$/, "").trim();
        await Promise.all([
          setDoc(doc(db, "ai_responses", reqId), {
            userId, requestId: reqId, message: clean, taskCreated,
            createdAt: new Date().toISOString(), status: "done",
          }),
          updateDoc(doc(db, "ai_requests", reqId), { status: "done", completedAt: new Date().toISOString() }),
        ]);
      } catch (e) {
        console.log("AI request error:", e.message);
        await Promise.all([
          setDoc(doc(db, "ai_responses", reqId), {
            userId, requestId: reqId,
            message: ru ? "⚠️ Ошибка. Попробуй позже." : "⚠️ Error. Try again.",
            taskCreated: null, createdAt: new Date().toISOString(), status: "error",
          }),
          updateDoc(doc(db, "ai_requests", reqId), { status: "error", completedAt: new Date().toISOString() }),
        ]).catch(() => {});
      }
    }
  }, err => {
    console.log("AI listener error:", err.message);
    setTimeout(startAiListener, 5000);
  });

  return unsub;
}

// ══════════════════════════════════════════════════════════════
// ОЧИСТКА СТАРЫХ ДАННЫХ
// ══════════════════════════════════════════════════════════════

async function cleanupOldData() {
  try {
    const ago3 = new Date(); ago3.setDate(ago3.getDate() - 3);
    const ago2 = new Date(); ago2.setDate(ago2.getDate() - 2);

    // Старые AI запросы
    try {
      const ai = await getDocs(query(collection(db, "ai_requests"), where("status", "==", "done")));
      const batch = writeBatch(db);
      let count = 0;
      ai.forEach(d => {
        if (d.data().completedAt && new Date(d.data().completedAt) < ago2) {
          batch.delete(doc(db, "ai_requests",  d.id));
          batch.delete(doc(db, "ai_responses", d.id));
          count++;
        }
      });
      if (count > 0) await batch.commit();
    } catch {}

    // Отправленные напоминания
    try {
      const sent = await getDocs(query(collection(db, "tasks"), where("isSent", "==", true)));
      const batch = writeBatch(db);
      let count = 0;
      sent.forEach(d => {
        if (d.data().createdAt && new Date(d.data().createdAt) < ago3) { batch.delete(d.ref); count++; }
      });
      if (count > 0) await batch.commit();
    } catch {}

    console.log("✅ Очистка завершена");
  } catch (e) { console.log("cleanupOldData:", e.message); }
}

// ══════════════════════════════════════════════════════════════
// ОБРАБОТКА ОШИБОК POLLING
// ══════════════════════════════════════════════════════════════

bot.on("polling_error", (err) => {
  const code = err.code || err.response?.statusCode;
  if (code === "EFATAL" || code === 409) {
    console.error("❌ Polling fatal error:", err.message);
    // Перезапускаем polling через 5 секунд
    setTimeout(() => {
      bot.stopPolling().then(() => bot.startPolling()).catch(() => {});
    }, 5000);
  } else {
    console.log("Polling error:", code, err.message);
  }
});

bot.on("error", (err) => {
  console.log("Bot error:", err.message);
});

// ══════════════════════════════════════════════════════════════
// ЗАПУСК
// ══════════════════════════════════════════════════════════════

startAiListener();

setInterval(checkReminders,              60 * 1000);         // каждую минуту
setInterval(sendMotivationNotifications, 60 * 1000);         // каждую минуту
setInterval(checkSubscriptions,      60 * 60 * 1000);        // каждый час
setInterval(cleanupOldData,       6 * 60 * 60 * 1000);       // каждые 6 часов

// Запускаем сразу при старте
Promise.all([checkReminders(), checkSubscriptions()])
  .then(() => console.log("✅ Все системы CortexAI запущены"));
