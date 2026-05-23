/**
 * CortexAI Bot
 * ─────────────────────────────────────────────────────────────
 * Возможности:
 *  • Личные задачи через чат с ботом
 *  • Inline-режим: @cortexaibot текст задачи — из любого чата
 *  • Групповые чаты — командные задачи
 *  • Google Calendar интеграция (OAuth2)
 *  • Напоминания, мотивация, подписки
 *  • Полная панель администратора
 */

const TelegramBot = require("node-telegram-bot-api");
const { initializeApp }  = require("firebase/app");
const {
  getFirestore, collection, query, where,
  getDocs, updateDoc, setDoc, doc, Timestamp,
  addDoc, deleteDoc, onSnapshot, getDoc,
  collectionGroup, arrayUnion, arrayRemove, writeBatch,
} = require("firebase/firestore");

// ─── Firebase ────────────────────────────────────────────────
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

// ─── Bot ─────────────────────────────────────────────────────
const token = process.env.BOT_TOKEN;
if (!token) { console.error("❌ BOT_TOKEN не задан!"); process.exit(1); }
const bot = new TelegramBot(token, { polling: true });

// ─── Конфиг ──────────────────────────────────────────────────
const ADMINS      = (process.env.ADMIN_IDS || "56733076").split(",").map(s => s.trim());
const WEBAPP_URL  = process.env.WEBAPP_URL || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const YOOKASSA_PROVIDER_TOKEN = process.env.YOOKASSA_PROVIDER_TOKEN || "";

// Google OAuth2
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI  || `${WEBAPP_URL}/auth/google/callback`;

const PERSONAL_WORKSPACE_ID = "personal";

const sentNotifications = new Set();
const sentMotivations   = new Set();

// Состояния ожидания ввода
const awaitingInput = new Map(); // chatId → { type, data }

// ─── Планы подписок ──────────────────────────────────────────
const SUBSCRIPTION_PLANS = {
  yk_month_1:     { label: "1 месяц",    days: 30,  amountKopecks: 9900,  amountRub: "99.00",  emoji: "📅", type: "yk"    },
  yk_month_3:     { label: "3 месяца",   days: 90,  amountKopecks: 39000, amountRub: "390.00", emoji: "🗓", type: "yk"    },
  yk_month_12:    { label: "12 месяцев", days: 365, amountKopecks: 59900, amountRub: "599.00", emoji: "🏆", type: "yk"    },
  stars_month_1:  { label: "1 месяц",    days: 30,  stars: 73,            emoji: "📅",          type: "stars" },
  stars_month_3:  { label: "3 месяца",   days: 90,  stars: 289,           emoji: "🗓",          type: "stars" },
  stars_month_12: { label: "12 месяцев", days: 365, stars: 430,           emoji: "🏆",          type: "stars" },
};

const MOTIVATION_SCHEDULES = {
  1: [14], 2: [10, 19], 3: [9, 14, 20], 4: [9, 13, 17, 20], 5: [8, 11, 14, 17, 20],
};

// ─── Init ─────────────────────────────────────────────────────
bot.setMyCommands([
  { command: "start",           description: "Запустить бота" },
  { command: "task",            description: "Создать задачу: /task Купить молоко завтра в 10:00" },
  { command: "tasks",           description: "Мои активные задачи" },
  { command: "done",            description: "Отметить задачу выполненной" },
  { command: "subscribe",       description: "Купить подписку" },
  { command: "gcal",            description: "Подключить Google Calendar" },
  { command: "myid",            description: "Узнать свой Telegram ID" },
  { command: "test_motivation", description: "Тест мотивации" },
]);

bot.setMyCommands([
  { command: "grouptasks",  description: "Задачи группы" },
  { command: "grouptask",   description: "Создать задачу группы: /grouptask Подготовить отчёт @user завтра" },
  { command: "groupdone",   description: "Закрыть задачу группы" },
  { command: "groupinfo",   description: "Информация о группе" },
], { scope: { type: "all_group_chats" } });

console.log("CortexAI Bot запущен ✅");
console.log("GROQ_API_KEY:",      GROQ_API_KEY      ? "задан ✅" : "не задан ❌");
console.log("WEBAPP_URL:",        WEBAPP_URL         || "НЕ ЗАДАН ⚠️");
console.log("GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID   ? "задан ✅" : "не задан (Google Cal отключён)");
console.log("ADMINS:",           ADMINS.join(", "));

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════

function isAdmin(userId) { return ADMINS.includes(String(userId)); }
function isGroup(chatId) { return chatId < 0; }
function formatDate(date) {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
function formatDateTime(date) {
  return date.toLocaleString("ru-RU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function getOpenAppButton(extra = "") {
  if (WEBAPP_URL && WEBAPP_URL.startsWith("https://")) {
    return {
      reply_markup: {
        inline_keyboard: [[
          { text: "🚀 Открыть CortexAI", web_app: { url: WEBAPP_URL + extra } },
        ]],
      },
    };
  }
  return {};
}

/** Безопасная отправка — не падает если пользователь заблокировал */
async function safeSend(chatId, text, opts = {}) {
  try {
    return await bot.sendMessage(chatId, text, opts);
  } catch (e) {
    if (e.response?.statusCode === 403 || String(e.message).includes("blocked")) {
      console.log(`⚠️ Пользователь ${chatId} заблокировал бота`);
    } else {
      console.log(`❌ Ошибка отправки ${chatId}: ${e.message}`);
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// GROQ AI
// ═══════════════════════════════════════════════════════════════

async function askGroq(messages, maxTokens = 300) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY не задан");
  const body = typeof messages === "string"
    ? { model: "llama-3.1-8b-instant", messages: [{ role: "user", content: messages }], max_tokens: maxTokens, temperature: 0.7 }
    : { model: "llama-3.1-8b-instant", messages, max_tokens: maxTokens, temperature: 0.7 };

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  return (await res.json()).choices?.[0]?.message?.content || "";
}

/**
 * Парсит свободный текст → задача через AI
 * Возвращает { title, dueDate, priority, assigneeUsername }
 */
async function parseTaskFromText(text) {
  const now = new Date();
  const prompt = [
    { role: "system", content: `Ты парсер задач. Текущее время: ${now.toLocaleString("ru-RU")}.
Извлеки из текста пользователя: название задачи, дату/время дедлайна, приоритет (low/medium/high), упомянутый username (@...).
Верни ТОЛЬКО JSON без пояснений:
{"title":"...", "dueDate":"ISO8601 или null", "priority":"medium", "assigneeUsername": "@username или null"}
Правила: dueDate=null если время не указано. priority=medium по умолчанию.` },
    { role: "user", content: text },
  ];
  try {
    const raw = await askGroq(prompt, 150);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { title: text, dueDate: null, priority: "medium", assigneeUsername: null };
    const parsed = JSON.parse(match[0]);
    return {
      title: parsed.title || text,
      dueDate: parsed.dueDate && parsed.dueDate !== "null" ? parsed.dueDate : null,
      priority: ["low", "medium", "high"].includes(parsed.priority) ? parsed.priority : "medium",
      assigneeUsername: parsed.assigneeUsername || null,
    };
  } catch {
    return { title: text, dueDate: null, priority: "medium", assigneeUsername: null };
  }
}

// ═══════════════════════════════════════════════════════════════
// FIREBASE — ПОЛЬЗОВАТЕЛИ
// ═══════════════════════════════════════════════════════════════

async function registerUser(msg) {
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
  const uname = username.replace("@", "").toLowerCase();
  try {
    const snap = await getDocs(query(collection(db, "users"), where("username", "==", uname)));
    if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════════════════
// FIREBASE — ПОДПИСКИ
// ═══════════════════════════════════════════════════════════════

async function grantSubscription(userId, days = 30, isGift = false) {
  const now = new Date();
  const expiresAt = new Date(now);
  try {
    const existing = await getDoc(doc(db, "subscriptions", String(userId)));
    if (existing.exists()) {
      const d = existing.data();
      if (d.isActive && d.expiresAt) {
        const ex = d.expiresAt.toDate();
        if (ex > now) { expiresAt.setTime(ex.getTime()); }
      }
    }
  } catch {}
  expiresAt.setDate(expiresAt.getDate() + days);
  await setDoc(doc(db, "subscriptions", String(userId)), {
    userId: String(userId), isActive: true,
    expiresAt: Timestamp.fromDate(expiresAt), updatedAt: Timestamp.fromDate(now),
    grantedAt: Timestamp.fromDate(now), isGift, notified3days: false, notified1day: false,
  });
  return expiresAt;
}

async function revokeSubscription(userId) {
  await setDoc(doc(db, "subscriptions", String(userId)),
    { userId: String(userId), isActive: false, updatedAt: Timestamp.fromDate(new Date()) },
    { merge: true });
}

async function checkHasSub(userId) {
  try {
    const snap = await getDoc(doc(db, "subscriptions", String(userId)));
    if (!snap.exists()) return false;
    const d = snap.data();
    return d.isActive && d.expiresAt && d.expiresAt.toDate() > new Date();
  } catch { return false; }
}

async function getSubInfo(userId) {
  try {
    const snap = await getDoc(doc(db, "subscriptions", String(userId)));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { isActive: d.isActive || false, expiresAt: d.expiresAt ? d.expiresAt.toDate() : null, isGift: d.isGift || false };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// FIREBASE — ЛИЧНЫЕ ЗАДАЧИ
// ═══════════════════════════════════════════════════════════════

async function createPersonalTask(userId, taskData) {
  const taskId = `tg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now    = new Date().toISOString();
  const task   = {
    id: taskId, userId,
    title:       taskData.title,
    description: taskData.description || "",
    dueDate:     taskData.dueDate     || null,
    priority:    taskData.priority    || "medium",
    status:      "todo",
    isAiCreated: taskData.isAiCreated || false,
    createdAt: now, updatedAt: now,
    notified: false,
    repeat:   taskData.repeat || "none",
    type:     "task",
    items:    [],
    workspaceId: PERSONAL_WORKSPACE_ID,
    source:   taskData.source || "bot",
  };

  // Сохраняем в user workspace
  await setDoc(doc(db, "users", userId, "workspaces", PERSONAL_WORKSPACE_ID, "tasks", taskId), task);

  // Сохраняем в bot-коллекцию для напоминаний
  if (taskData.dueDate) {
    const dueDate = new Date(taskData.dueDate);
    if (!isNaN(dueDate.getTime()) && dueDate > new Date()) {
      await addDoc(collection(db, "tasks"), {
        userId, taskId,
        title: task.title, description: task.description,
        dueDate: task.dueDate, priority: task.priority, status: "todo",
        createdAt: now, isSent: false,
        reminderAt: Timestamp.fromDate(dueDate),
        repeat: task.repeat, type: "task",
      }).catch(() => {});
    }
  }

  // Синхронизируем с Google Calendar если подключён
  if (taskData.dueDate) {
    syncTaskToGoogleCalendar(userId, task).catch(() => {});
  }

  return task;
}

async function getUserTasks(userId, limit = 10) {
  try {
    const snap = await getDocs(
      collection(db, "users", userId, "workspaces", PERSONAL_WORKSPACE_ID, "tasks")
    );
    const tasks = [];
    snap.forEach(d => {
      const t = d.data();
      if (t.status !== "done") tasks.push(t);
    });
    tasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
    return tasks.slice(0, limit);
  } catch { return []; }
}

async function markTaskDone(userId, taskId) {
  const now = new Date().toISOString();
  await updateDoc(
    doc(db, "users", userId, "workspaces", PERSONAL_WORKSPACE_ID, "tasks", taskId),
    { status: "done", completedAt: now, updatedAt: now }
  ).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// FIREBASE — ГРУППОВЫЕ ЗАДАЧИ
// ═══════════════════════════════════════════════════════════════

async function ensureGroupWorkspace(chatId, chatTitle) {
  const ref = doc(db, "groupWorkspaces", String(chatId));
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      chatId: String(chatId),
      title:     chatTitle || "Группа",
      createdAt: new Date().toISOString(),
      memberIds: [],
    });
  }
  return String(chatId);
}

async function addGroupMember(chatId, userId, userInfo) {
  await setDoc(
    doc(db, "groupWorkspaces", String(chatId), "members", String(userId)),
    { userId: String(userId), ...userInfo, joinedAt: new Date().toISOString() },
    { merge: true }
  );
  await setDoc(doc(db, "groupWorkspaces", String(chatId)), {
    memberIds: arrayUnion(String(userId)),
  }, { merge: true });
}

async function createGroupTask(chatId, taskData) {
  const taskId = `gtask_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now    = new Date().toISOString();
  const task   = {
    id: taskId,
    chatId: String(chatId),
    title:        taskData.title,
    description:  taskData.description  || "",
    dueDate:      taskData.dueDate      || null,
    priority:     taskData.priority     || "medium",
    status:       "todo",
    createdBy:    taskData.createdBy,
    createdByName: taskData.createdByName || "",
    assigneeId:   taskData.assigneeId   || null,
    assigneeName: taskData.assigneeName || null,
    createdAt: now, updatedAt: now,
    isSent: false,
  };
  await setDoc(doc(db, "groupWorkspaces", String(chatId), "tasks", taskId), task);

  // Уведомление назначенному участнику
  if (taskData.assigneeId && taskData.assigneeId !== taskData.createdBy) {
    const dueStr = task.dueDate
      ? `\n⏰ Срок: ${formatDateTime(new Date(task.dueDate))}` : "";
    await safeSend(
      taskData.assigneeId,
      `📋 Тебе назначена задача!\n\n📌 ${task.title}${dueStr}\n👤 Назначил: ${taskData.createdByName || "участник"}\n💬 Группа: ${taskData.chatTitle || "команда"}`,
      getOpenAppButton()
    );
  }

  // Если есть дедлайн — создаём напоминание
  if (task.dueDate) {
    const dueDate = new Date(task.dueDate);
    if (!isNaN(dueDate.getTime()) && dueDate > new Date()) {
      const targets = taskData.assigneeId ? [taskData.assigneeId] : (taskData.memberIds || []);
      for (const memberId of targets) {
        await addDoc(collection(db, "tasks"), {
          userId: memberId, taskId,
          title: task.title, description: "", dueDate: task.dueDate,
          priority: task.priority, status: "todo",
          createdAt: now, isSent: false,
          reminderAt: Timestamp.fromDate(dueDate),
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
      const t = d.data();
      if (!onlyActive || t.status !== "done") tasks.push(t);
    });
    tasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      if (a.dueDate) return -1; if (b.dueDate) return 1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
    return tasks;
  } catch { return []; }
}

async function markGroupTaskDone(chatId, taskId, userId, userName) {
  const now = new Date().toISOString();
  await updateDoc(
    doc(db, "groupWorkspaces", String(chatId), "tasks", taskId),
    { status: "done", completedAt: now, completedBy: userId, completedByName: userName, updatedAt: now }
  ).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// GOOGLE CALENDAR
// ═══════════════════════════════════════════════════════════════

function getGoogleAuthUrl(userId) {
  if (!GOOGLE_CLIENT_ID) return null;
  const params = new URLSearchParams({
    client_id:    GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state: userId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function getGoogleTokens(userId) {
  try {
    const snap = await getDoc(doc(db, "users", userId, "integrations", "googleCalendar"));
    if (!snap.exists()) return null;
    return snap.data();
  } catch { return null; }
}

async function refreshGoogleToken(userId, refreshToken) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type:    "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Сохраняем новый access_token
    await setDoc(doc(db, "users", userId, "integrations", "googleCalendar"), {
      accessToken:  data.access_token,
      expiresAt:    Date.now() + (data.expires_in * 1000),
      refreshToken, connected: true,
    }, { merge: true });
    return data.access_token;
  } catch { return null; }
}

async function getValidAccessToken(userId) {
  const tokens = await getGoogleTokens(userId);
  if (!tokens || !tokens.connected) return null;
  if (tokens.expiresAt && Date.now() < tokens.expiresAt - 60000) {
    return tokens.accessToken;
  }
  return await refreshGoogleToken(userId, tokens.refreshToken);
}

async function syncTaskToGoogleCalendar(userId, task) {
  if (!GOOGLE_CLIENT_ID || !task.dueDate) return;
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;

  try {
    const startTime = new Date(task.dueDate);
    const endTime   = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 час

    const event = {
      summary:     task.title,
      description: task.description || "Создано CortexAI",
      start: { dateTime: startTime.toISOString(), timeZone: "Europe/Moscow" },
      end:   { dateTime: endTime.toISOString(),   timeZone: "Europe/Moscow" },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup",  minutes: 30 },
          { method: "email",  minutes: 60 },
        ],
      },
      source: {
        title: "CortexAI",
        url:   WEBAPP_URL || "https://t.me/cortexaibot",
      },
    };

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(event),
      }
    );

    if (res.ok) {
      const data = await res.json();
      // Сохраняем Google Event ID для дальнейшего управления
      await setDoc(
        doc(db, "users", userId, "workspaces", PERSONAL_WORKSPACE_ID, "tasks", task.id),
        { googleEventId: data.id, googleCalendarSynced: true },
        { merge: true }
      ).catch(() => {});
      console.log(`📅 Google Calendar: событие создано для ${userId} — ${task.title}`);
    }
  } catch (e) {
    console.log("Google Calendar sync error:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// ПОДПИСКИ — ПЛАТЁЖНОЕ МЕНЮ
// ═══════════════════════════════════════════════════════════════

function buildProviderData(plan) {
  return JSON.stringify({
    receipt: {
      items: [{
        description: `Подписка CortexAI на ${plan.label}`,
        quantity: 1,
        amount: { value: plan.amountRub, currency: "RUB" },
        vat_code: 1, payment_mode: "full_payment", payment_subject: "service",
      }],
      tax_system_code: 1,
    },
  });
}

async function showSubscribeMenu(chatId) {
  const ykLines = YOOKASSA_PROVIDER_TOKEN
    ? "💳 Оплата рублями (ЮKassa):\n  📅 1 месяц — 99 ₽\n  🗓 3 месяца — 390 ₽\n  🏆 12 месяцев — 599 ₽\n\n"
    : "";
  const ykBtn = YOOKASSA_PROVIDER_TOKEN
    ? [[{ text: "💳 Оплата рублями (ЮKassa)", callback_data: "menu_yk" }]]
    : [];

  await bot.sendMessage(chatId,
    `💎 Подписка CortexAI\n\n${ykLines}⭐ Оплата Telegram Stars:\n  📅 1 месяц — 73 ⭐\n  🗓 3 месяца — 289 ⭐\n  🏆 12 месяцев — 430 ⭐\n\nВсё включено:\n✅ Безлимитные задачи\n✅ AI без лимитов\n✅ Уведомления и мотивация`,
    { reply_markup: { inline_keyboard: [...ykBtn, [{ text: "⭐ Оплата Stars", callback_data: "menu_stars" }]] } }
  );
}

// ═══════════════════════════════════════════════════════════════
// МОТИВАЦИЯ
// ═══════════════════════════════════════════════════════════════

const FALLBACK_MOTIVATIONS = {
  soft:   ["🌸 Ты делаешь всё что можешь — это уже здорово!", "💙 Каждый маленький шаг важен.", "✨ Верь в себя — ты справишься!"],
  normal: ["⚡ У тебя есть задачи — значит есть цель. Вперёд!", "🎯 Фокус на одной задаче. Ты справишься!", "🚀 Сегодня хороший день чтобы сделать что-то важное!"],
  hard:   ["🔥 Хватит откладывать. Задачи сами себя не выполнят.", "⚡ Никаких оправданий. Только результат.", "🏆 Победители просто делают."],
};

async function generateMotivation(userId, mode, tasks) {
  const now = new Date();
  const timeOfDay = now.getHours() < 12 ? "утро" : now.getHours() < 17 ? "день" : "вечер";
  const tasksList = tasks.length > 0
    ? tasks.slice(0, 5).map(t => `- ${t.title}${t.dueDate ? ` (до ${formatDateTime(new Date(t.dueDate))})` : ""}`).join("\n")
    : "задач нет";
  const instructions = {
    soft:   "Ты добрый поддерживающий друг. Пиши тепло, мягко, без давления.",
    normal: "Ты энергичный мотивационный коуч. Пиши позитивно, конкретно.",
    hard:   "Ты требовательный тренер. Пиши прямо, честно. БЕЗ мата.",
  };
  const prompt = `${instructions[mode] || instructions.normal}\nСейчас ${timeOfDay}.\nЗадачи:\n${tasksList}\nНапиши мотивирующее сообщение (2-3 предл.), с 1-2 эмодзи, только русский.`;
  try { return await askGroq(prompt, 150) || null; }
  catch { return null; }
}

async function sendMotivationNotifications() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().split("T")[0];
    let processed = 0;

    let settingsSnap;
    try {
      settingsSnap = await getDocs(query(collectionGroup(db, "settings"), where("enabled", "==", true)));
    } catch {
      await sendMotivationFallback(currentHour, todayStr);
      return;
    }

    if (settingsSnap.empty) { await sendMotivationFallback(currentHour, todayStr); return; }

    for (const d of settingsSnap.docs) {
      if (d.id !== "motivation") continue;
      const s = d.data();
      if (!s.enabled || s.mode === "off") continue;
      const parts = d.ref.path.split("/");
      if (parts.length < 4) continue;
      await processMotivationForUser(parts[1], s, currentHour, todayStr);
      processed++;
    }
    if (processed > 0) console.log(`💪 Мотивация: ${processed} пользователей`);
    if (sentMotivations.size > 5000) {
      const del = [];
      sentMotivations.forEach(k => { if (!k.includes(todayStr)) del.push(k); });
      del.forEach(k => sentMotivations.delete(k));
    }
  } catch (e) { console.log("❌ sendMotivationNotifications:", e.message); }
}

async function sendMotivationFallback(currentHour, todayStr) {
  try {
    const snap = await getDocs(collection(db, "users"));
    for (const d of snap.docs) {
      try {
        const s = await getDoc(doc(db, "users", d.id, "settings", "motivation"));
        if (!s.exists() || !s.data().enabled || s.data().mode === "off") continue;
        await processMotivationForUser(d.id, s.data(), currentHour, todayStr);
      } catch {}
    }
  } catch (e) { console.log("Fallback мотивация:", e.message); }
}

async function processMotivationForUser(userId, settings, currentHour, todayStr) {
  try {
    const schedule = MOTIVATION_SCHEDULES[settings.timesPerDay || 3] || MOTIVATION_SCHEDULES[3];
    if (!schedule.includes(currentHour)) return;
    const key = `mot_${userId}_${todayStr}_${currentHour}`;
    if (sentMotivations.has(key)) return;
    sentMotivations.add(key);

    const tasksSnap = await getDocs(collection(db, "users", userId, "workspaces", PERSONAL_WORKSPACE_ID, "tasks"));
    const active = [];
    tasksSnap.forEach(d => { const t = d.data(); if (t.status !== "done" && t.title) active.push(t); });

    let text = await generateMotivation(userId, settings.mode, active);
    if (!text) {
      const list = FALLBACK_MOTIVATIONS[settings.mode] || FALLBACK_MOTIVATIONS.normal;
      text = list[Math.floor(Math.random() * list.length)];
    }
    await safeSend(userId, `💪 Мотивация\n\n${text}`);
    console.log(`✅ Мотивация → ${userId}`);
  } catch (e) {
    console.log(`❌ Мотивация ${userId}: ${e.message}`);
    if (/403|blocked|deactivated/.test(e.message)) {
      setDoc(doc(db, "users", userId, "settings", "motivation"), { enabled: false }, { merge: true }).catch(() => {});
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// НАПОМИНАНИЯ
// ═══════════════════════════════════════════════════════════════

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
        await updateDoc(doc(db, "tasks", d.id), { isSent: true });
        if (task.status === "done" || !task.userId) continue;

        const isGroup = task.isGroupTask;
        const text = isGroup
          ? `🔔 Напоминание о групповой задаче!\n\n📌 ${task.title}${task.assigneeName ? `\n👤 Назначена: ${task.assigneeName}` : ""}`
          : `🔔 Напоминание!\n\n📌 ${task.title}${task.description ? `\n${task.description}` : ""}${task.repeat && task.repeat !== "none" ? `\n\n🔁 Повторяющаяся задача` : ""}`;

        const markup = isGroup && task.chatId
          ? { reply_markup: { inline_keyboard: [[{ text: "✅ Выполнить", callback_data: `gdone_${task.chatId}_${task.taskId}` }]] } }
          : { reply_markup: { inline_keyboard: [[{ text: "✅ Выполнить", callback_data: `done_${task.taskId}` }]] } };

        await safeSend(task.userId, text, markup);

        if (task.repeat === "daily" && task.status !== "done") {
          await createNextDailyTask(task);
        }
        console.log(`✅ Напоминание → ${task.userId}: ${task.title}`);
      } catch (e) { console.log(`❌ Напоминание: ${e.message}`); }
    }
    if (sentNotifications.size > 2000) sentNotifications.clear();
  } catch (e) { console.log("checkReminders:", e.message); }
}

async function createNextDailyTask(task) {
  try {
    const next = new Date(task.reminderAt.toDate());
    next.setDate(next.getDate() + 1);
    const nextStr = next.toISOString().split("T")[0];
    const existing = await getDocs(query(
      collection(db, "tasks"),
      where("userId", "==", task.userId), where("title", "==", task.title),
      where("repeat", "==", "daily"), where("isSent", "==", false)
    ));
    let exists = false;
    existing.forEach(d => { if (d.data().dueDate?.startsWith(nextStr)) exists = true; });
    if (exists) return;
    await addDoc(collection(db, "tasks"), {
      userId: task.userId, taskId: `daily_${Date.now()}`, title: task.title,
      description: task.description || "", dueDate: next.toISOString(),
      priority: task.priority || "medium", status: "todo",
      createdAt: new Date().toISOString(), isSent: false,
      reminderAt: Timestamp.fromDate(next), repeat: "daily",
    });
  } catch (e) { console.log("createNextDailyTask:", e.message); }
}

// ═══════════════════════════════════════════════════════════════
// ПРОВЕРКА ПОДПИСОК
// ═══════════════════════════════════════════════════════════════

async function checkSubscriptions() {
  try {
    const now = new Date();
    const snap = await getDocs(collection(db, "subscriptions"));
    for (const d of snap.docs) {
      const sub = d.data();
      if (!sub.isActive || !sub.expiresAt || !sub.userId) continue;
      const expiresAt = sub.expiresAt.toDate();
      const daysLeft  = Math.ceil((expiresAt - now) / 86400000);
      if (daysLeft === 3 && !sub.notified3days) {
        await safeSend(sub.userId, "⚠️ Подписка CortexAI заканчивается через 3 дня!\n\nНапиши /subscribe для продления 🚀");
        await updateDoc(doc(db, "subscriptions", d.id), { notified3days: true }).catch(() => {});
      }
      if (daysLeft === 1 && !sub.notified1day) {
        await safeSend(sub.userId, "🚨 Подписка CortexAI заканчивается ЗАВТРА!\n\nНапиши /subscribe ⚡");
        await updateDoc(doc(db, "subscriptions", d.id), { notified1day: true }).catch(() => {});
      }
      if (daysLeft <= 0 && sub.isActive) {
        await updateDoc(doc(db, "subscriptions", d.id), { isActive: false }).catch(() => {});
        await safeSend(sub.userId, "❌ Подписка CortexAI истекла.\n\nНапиши /subscribe.");
      }
    }
  } catch (e) { console.log("checkSubscriptions:", e.message); }
}

// ═══════════════════════════════════════════════════════════════
// HELPER — форматирование задач
// ═══════════════════════════════════════════════════════════════

function formatTaskList(tasks, prefix = "") {
  if (tasks.length === 0) return "Задач нет 🎉";
  const priorityEmoji = { high: "🔴", medium: "🟡", low: "🟢" };
  return tasks.map((t, i) => {
    const p = priorityEmoji[t.priority] || "⚪";
    const d = t.dueDate ? `\n   ⏰ ${formatDateTime(new Date(t.dueDate))}` : "";
    const a = t.assigneeName ? `\n   👤 ${t.assigneeName}` : "";
    return `${prefix}${i + 1}. ${p} ${t.title}${d}${a}`;
  }).join("\n\n");
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// КОМАНДЫ — ЛИЧНЫЙ ЧАТ
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

// /start
bot.onText(/\/start(.*)/, async (msg, match) => {
  if (isGroup(msg.chat.id)) return; // start только в личке
  const userId = String(msg.from.id);
  const param  = (match[1] || "").trim().replace(/^\//, "");

  await registerUser(msg);
  if (isAdmin(userId)) { grantSubscription(userId, 3650, true).catch(() => {}); }

  if (param === "subscribe") {
    if (isAdmin(userId)) { await bot.sendMessage(msg.chat.id, "👑 Ты администратор — подписка уже активна."); return; }
    await showSubscribeMenu(msg.chat.id);
    return;
  }

  // Google Calendar callback
  if (param.startsWith("gcal_")) {
    const code = param.replace("gcal_", "");
    await handleGoogleCalendarCode(msg.chat.id, userId, code);
    return;
  }

  const hasSub = await checkHasSub(userId);

  await bot.sendMessage(msg.chat.id,
    `Привет, ${msg.from.first_name || "друг"}! 👋\n\n` +
    `Я CortexAI — твой умный планировщик.\n\n` +
    `📝 Что я умею:\n` +
    `• Создать задачу: /task Купить молоко завтра в 10:00\n` +
    `• Посмотреть задачи: /tasks\n` +
    `• В любом чате: @${(await bot.getMe()).username} текст задачи\n` +
    `• Добавь меня в группу для командных задач!\n\n` +
    `${hasSub ? "✅ Подписка активна" : "📋 Доступно 5 бесплатных AI-запросов/день"}\n\n` +
    `💡 Напиши мне любую задачу прямо сейчас!`,
    getOpenAppButton()
  );
});

// /myid
bot.onText(/\/myid/, msg => {
  bot.sendMessage(msg.chat.id, `🆔 Telegram ID: \`${msg.from.id}\``, { parse_mode: "Markdown" });
});

// /appss_verify
bot.onText(/\/appss_verify/, msg => { bot.sendMessage(msg.chat.id, "appss_73be81"); });

// ────────────────────────────────────────────────────────────────
// /task — создать личную задачу из текста
// ────────────────────────────────────────────────────────────────
bot.onText(/\/task(?:\s+(.+))?/, async (msg, match) => {
  if (isGroup(msg.chat.id)) return; // в группах — /grouptask
  const userId = String(msg.from.id);
  await registerUser(msg);

  const text = match[1]?.trim();
  if (!text) {
    await bot.sendMessage(msg.chat.id,
      "📝 Напиши задачу после команды:\n\n" +
      "/task Купить молоко\n" +
      "/task Встреча с Иваном завтра в 15:00\n" +
      "/task Отправить отчёт в пятницу до 18:00 🔴\n\n" +
      "Или просто напиши мне в чат — я сам создам задачу!"
    );
    return;
  }

  const wait = await bot.sendMessage(msg.chat.id, "⏳ Разбираю задачу...");
  const parsed = await parseTaskFromText(text);

  const task = await createPersonalTask(userId, {
    ...parsed, isAiCreated: true, source: "bot_command",
  });

  const dueStr = task.dueDate ? `\n⏰ Срок: ${formatDateTime(new Date(task.dueDate))}` : "";
  const calStr = task.dueDate && (await getGoogleTokens(userId))?.connected
    ? "\n📅 Добавлено в Google Calendar" : "";

  await bot.editMessageText(
    `✅ Задача создана!\n\n📌 ${task.title}${dueStr}${calStr}\n\n💬 /tasks — все задачи`,
    { chat_id: msg.chat.id, message_id: wait.message_id, ...getOpenAppButton() }
  );
});

// ────────────────────────────────────────────────────────────────
// /tasks — список личных задач
// ────────────────────────────────────────────────────────────────
bot.onText(/\/tasks/, async (msg) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  await registerUser(msg);

  const tasks = await getUserTasks(userId);
  const text  = tasks.length > 0
    ? `📋 Твои задачи (${tasks.length}):\n\n${formatTaskList(tasks)}\n\n✅ Выполнить: /done`
    : "📋 Активных задач нет! 🎉\n\nСоздай новую: /task Название задачи";

  await bot.sendMessage(msg.chat.id, text, getOpenAppButton());
});

// ────────────────────────────────────────────────────────────────
// /done — отметить личную задачу выполненной
// ────────────────────────────────────────────────────────────────
bot.onText(/\/done(?:\s+(\d+))?/, async (msg, match) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  const tasks  = await getUserTasks(userId);

  if (tasks.length === 0) {
    await bot.sendMessage(msg.chat.id, "🎉 Нет активных задач!");
    return;
  }

  const num = parseInt(match[1]);
  if (num && num >= 1 && num <= tasks.length) {
    const task = tasks[num - 1];
    await markTaskDone(userId, task.id);
    await bot.sendMessage(msg.chat.id, `✅ Выполнено: ${task.title} 🎉`);
    return;
  }

  // Показываем список с inline-кнопками
  const keyboard = tasks.slice(0, 10).map((t, i) => ([{
    text: `${i + 1}. ${t.title.substring(0, 35)}`,
    callback_data: `done_${t.id}`,
  }]));

  await bot.sendMessage(msg.chat.id, "✅ Какую задачу отметить выполненной?", {
    reply_markup: { inline_keyboard: keyboard },
  });
});

// ────────────────────────────────────────────────────────────────
// /subscribe
// ────────────────────────────────────────────────────────────────
bot.onText(/\/subscribe$/, async (msg) => {
  if (isGroup(msg.chat.id)) {
    await bot.sendMessage(msg.chat.id, "💎 Оформить подписку можно в личном чате с ботом → @cortexaibot");
    return;
  }
  if (isAdmin(String(msg.from.id))) {
    await bot.sendMessage(msg.chat.id, "👑 Ты администратор — подписка уже активна бесплатно.");
    return;
  }
  await showSubscribeMenu(msg.chat.id);
});

// ────────────────────────────────────────────────────────────────
// /gcal — подключить Google Calendar
// ────────────────────────────────────────────────────────────────
bot.onText(/\/gcal/, async (msg) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  await registerUser(msg);

  if (!GOOGLE_CLIENT_ID) {
    await bot.sendMessage(msg.chat.id,
      "📅 Google Calendar интеграция не настроена.\n\nОбратитесь к администратору.");
    return;
  }

  const existing = await getGoogleTokens(userId);
  if (existing?.connected) {
    await bot.sendMessage(msg.chat.id,
      "✅ Google Calendar уже подключён!\n\nЗадачи с дедлайном автоматически добавляются в твой календарь.\n\nОтключить: /gcal_disconnect",
      { reply_markup: { inline_keyboard: [[{ text: "🔌 Отключить", callback_data: "gcal_disconnect" }]] } }
    );
    return;
  }

  const authUrl = getGoogleAuthUrl(userId);
  await bot.sendMessage(msg.chat.id,
    "📅 Подключение Google Calendar\n\n" +
    "После подключения все задачи с дедлайном будут автоматически добавляться в твой Google Calendar с напоминаниями.\n\n" +
    "Нажми кнопку ниже для авторизации:",
    { reply_markup: { inline_keyboard: [[{ text: "📅 Подключить Google Calendar", url: authUrl }]] } }
  );
});

bot.onText(/\/gcal_disconnect/, async (msg) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  await setDoc(doc(db, "users", userId, "integrations", "googleCalendar"),
    { connected: false }, { merge: true });
  await bot.sendMessage(msg.chat.id, "🔌 Google Calendar отключён.");
});

async function handleGoogleCalendarCode(chatId, userId, code) {
  if (!GOOGLE_CLIENT_ID) return;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI, grant_type: "authorization_code", code,
      }),
    });
    if (!res.ok) throw new Error(`OAuth error: ${res.status}`);
    const data = await res.json();
    await setDoc(doc(db, "users", userId, "integrations", "googleCalendar"), {
      accessToken: data.access_token, refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000), connected: true,
      connectedAt: new Date().toISOString(),
    });
    await bot.sendMessage(chatId,
      "✅ Google Calendar успешно подключён!\n\nТеперь все задачи с дедлайном будут автоматически добавляться в твой календарь 📅");
  } catch (e) {
    await bot.sendMessage(chatId, `❌ Ошибка подключения: ${e.message}`);
  }
}

// ────────────────────────────────────────────────────────────────
// /test_motivation
// ────────────────────────────────────────────────────────────────
bot.onText(/\/test_motivation/, async (msg) => {
  if (isGroup(msg.chat.id)) return;
  const userId = String(msg.from.id);
  try {
    const snap = await getDoc(doc(db, "users", userId, "settings", "motivation"));
    if (!snap.exists()) {
      await bot.sendMessage(msg.chat.id,
        "❌ Настройки мотивации не найдены.\n\nОткрой приложение → AI → ⚙️ → включи мотивацию.");
      return;
    }
    const settings = snap.data();
    await bot.sendMessage(msg.chat.id, `🔍 Настройки: режим=${settings.mode}, в день=${settings.timesPerDay}×\n\nГенерирую...`);

    const tasks = await getUserTasks(userId);
    let text = await generateMotivation(userId, settings.mode || "normal", tasks);
    if (!text) {
      const list = FALLBACK_MOTIVATIONS[settings.mode] || FALLBACK_MOTIVATIONS.normal;
      text = list[Math.floor(Math.random() * list.length)];
    }
    await bot.sendMessage(msg.chat.id, `💪 Мотивация (тест)\n\n${text}`);
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

// ═══════════════════════════════════════════════════════════════
// СВОБОДНЫЙ ТЕКСТ В ЛИЧКЕ — создаём задачу через AI
// ═══════════════════════════════════════════════════════════════

bot.on("message", async (msg) => {
  if (isGroup(msg.chat.id)) return;            // группы — отдельная логика
  if (!msg.text) return;
  if (msg.text.startsWith("/")) return;         // команды уже обработаны
  if (msg.via_bot) return;

  const userId = String(msg.from.id);
  const text   = msg.text.trim();

  // Проверяем ожидание ввода
  const waiting = awaitingInput.get(msg.chat.id);
  if (waiting) {
    awaitingInput.delete(msg.chat.id);
    if (waiting.type === "task_title") {
      const parsed = await parseTaskFromText(text);
      const task   = await createPersonalTask(userId, { ...parsed, isAiCreated: true, source: "bot_text" });
      const dueStr = task.dueDate ? `\n⏰ ${formatDateTime(new Date(task.dueDate))}` : "";
      await bot.sendMessage(msg.chat.id, `✅ Задача создана!\n📌 ${task.title}${dueStr}`, getOpenAppButton());
      return;
    }
  }

  await registerUser(msg);

  // Если похоже на задачу — создаём
  const taskKeywords = /купи|напомни|сделай|встреча|позвони|отправь|подготов|создай|провер|задача|дело|план|запись|remind|buy|call|send|meeting|task|todo/i;

  if (taskKeywords.test(text) || text.length < 100) {
    const wait = await bot.sendMessage(msg.chat.id, "⏳ Создаю задачу...");
    const parsed = await parseTaskFromText(text);
    const task   = await createPersonalTask(userId, { ...parsed, isAiCreated: true, source: "bot_text" });
    const dueStr = task.dueDate ? `\n⏰ ${formatDateTime(new Date(task.dueDate))}` : "";
    const calStr = task.dueDate && (await getGoogleTokens(userId))?.connected ? "\n📅 → Google Calendar" : "";

    await bot.editMessageText(
      `✅ Задача создана!\n\n📌 ${task.title}${dueStr}${calStr}\n\n💬 /tasks — все задачи | ✅ /done — выполнить`,
      { chat_id: msg.chat.id, message_id: wait.message_id,
        reply_markup: { inline_keyboard: [[{ text: "📋 Открыть приложение", web_app: WEBAPP_URL ? { url: WEBAPP_URL } : undefined }].filter(b => b.web_app)] }
      }
    );
  } else {
    // Помогаем пользователю
    await bot.sendMessage(msg.chat.id,
      `Привет! Напиши задачу или используй:\n\n` +
      `/task ${text.substring(0, 30)}...\n/tasks — мои задачи\n/subscribe — подписка`,
      getOpenAppButton()
    );
  }
});

// ═══════════════════════════════════════════════════════════════
// INLINE MODE — @botname текст задачи из любого чата
// ═══════════════════════════════════════════════════════════════

bot.on("inline_query", async (query) => {
  const userId = String(query.from.id);
  const text   = query.query.trim();

  if (!text) {
    await bot.answerInlineQuery(query.id, [{
      type: "article", id: "help",
      title: "📝 Создать задачу",
      description: "Введи название задачи...",
      input_message_content: { message_text: "🤖 Используй: @cortexaibot текст задачи" },
    }], { cache_time: 0 });
    return;
  }

  // Быстрый предпросмотр без AI (чтобы не тормозить)
  const results = [
    {
      type: "article",
      id: `task_${Date.now()}`,
      title: `📌 ${text.substring(0, 50)}`,
      description: "Нажми чтобы создать задачу в CortexAI",
      thumb_url: "https://img.icons8.com/fluency/96/task.png",
      input_message_content: {
        message_text: `📌 Новая задача: ${text}\n\n_Создаётся в CortexAI..._`,
        parse_mode: "Markdown",
      },
      reply_markup: WEBAPP_URL ? {
        inline_keyboard: [[{ text: "🚀 Открыть CortexAI", url: WEBAPP_URL }]],
      } : undefined,
    },
  ];

  await bot.answerInlineQuery(query.id, results, { cache_time: 0 });

  // Создаём задачу в фоне
  setTimeout(async () => {
    try {
      const parsed = await parseTaskFromText(text);
      await createPersonalTask(userId, { ...parsed, isAiCreated: true, source: "inline" });
      // Уведомляем пользователя в личку
      await safeSend(userId,
        `✅ Задача создана через inline!\n\n📌 ${parsed.title}${parsed.dueDate ? `\n⏰ ${formatDateTime(new Date(parsed.dueDate))}` : ""}\n\n/tasks — все задачи`,
        getOpenAppButton()
      );
    } catch (e) { console.log("Inline task error:", e.message); }
  }, 500);
});

// ═══════════════════════════════════════════════════════════════
// ГРУППОВЫЕ ЧАТЫ
// ═══════════════════════════════════════════════════════════════

// Бот добавлен в группу
bot.on("my_chat_member", async (update) => {
  const { chat, new_chat_member } = update;
  if (new_chat_member.status !== "member" && new_chat_member.status !== "administrator") return;
  if (!isGroup(chat.id)) return;

  await ensureGroupWorkspace(chat.id, chat.title);
  await bot.sendMessage(chat.id,
    `👋 Привет! Я CortexAI — умный планировщик.\n\n` +
    `🤝 Командные задачи:\n` +
    `📋 /grouptask Подготовить презентацию @user завтра в 18:00\n` +
    `📋 /grouptasks — список задач группы\n` +
    `✅ /groupdone — отметить задачу\n` +
    `ℹ️ /groupinfo — информация\n\n` +
    `💡 Упомяни меня в любом сообщении: @${(await bot.getMe()).username} задача — и я создам её!\n\n` +
    `🔗 Каждый участник может открыть общие задачи в приложении:`,
    getOpenAppButton()
  );
});

// Новый участник вступил в группу
bot.on("new_chat_members", async (msg) => {
  if (!isGroup(msg.chat.id)) return;
  for (const member of msg.new_chat_members) {
    if (member.is_bot) continue;
    const userId = String(member.id);
    await addGroupMember(msg.chat.id, userId, {
      firstName: member.first_name || "",
      lastName:  member.last_name  || "",
      username:  member.username   || "",
    });
  }
});

// Участник вышел
bot.on("left_chat_member", async (msg) => {
  if (!isGroup(msg.chat.id)) return;
  try {
    await deleteDoc(doc(db, "groupWorkspaces", String(msg.chat.id), "members", String(msg.left_chat_member.id)));
    await setDoc(doc(db, "groupWorkspaces", String(msg.chat.id)),
      { memberIds: arrayRemove(String(msg.left_chat_member.id)) }, { merge: true });
  } catch {}
});

// /grouptask — создать командную задачу
bot.onText(/\/grouptask(?:@\S+)?(?:\s+(.+))?/, async (msg, match) => {
  if (!isGroup(msg.chat.id)) {
    await bot.sendMessage(msg.chat.id, "📋 Эта команда работает только в групповых чатах.");
    return;
  }
  const userId   = String(msg.from.id);
  const chatId   = msg.chat.id;
  const text     = match[1]?.trim();

  if (!text) {
    await bot.sendMessage(chatId,
      "📋 Формат: /grouptask Название задачи [@username] [дата]\n\n" +
      "Примеры:\n" +
      "/grouptask Подготовить презентацию @ivan завтра в 18:00\n" +
      "/grouptask Отправить отчёт в пятницу\n" +
      "/grouptask Провести созвон в 15:00");
    return;
  }

  await ensureGroupWorkspace(chatId, msg.chat.title);
  await addGroupMember(chatId, userId, {
    firstName: msg.from.first_name || "", username: msg.from.username || "",
  });

  const wait   = await bot.sendMessage(chatId, "⏳ Создаю задачу...");
  const parsed = await parseTaskFromText(text);

  // Находим assignee если упомянут @username
  let assigneeId = null, assigneeName = null;
  if (parsed.assigneeUsername) {
    const user = await getUserByUsername(parsed.assigneeUsername);
    if (user) { assigneeId = user.id; assigneeName = user.firstName || parsed.assigneeUsername; }
  }

  // Получаем список участников для напоминаний
  const membersSnap = await getDocs(collection(db, "groupWorkspaces", String(chatId), "members")).catch(() => null);
  const memberIds = [];
  if (membersSnap) membersSnap.forEach(d => memberIds.push(d.id));

  const task = await createGroupTask(chatId, {
    ...parsed,
    createdBy:     userId,
    createdByName: msg.from.first_name || "участник",
    assigneeId, assigneeName,
    chatTitle: msg.chat.title, memberIds,
  });

  const dueStr = task.dueDate ? `\n⏰ ${formatDateTime(new Date(task.dueDate))}` : "";
  const asStr  = assigneeName ? `\n👤 Назначено: ${assigneeName}` : "";

  await bot.editMessageText(
    `✅ Задача создана!\n\n📌 ${task.title}${dueStr}${asStr}\n\n📋 /grouptasks — все задачи группы`,
    { chat_id: chatId, message_id: wait.message_id,
      reply_markup: { inline_keyboard: [[{ text: "✅ Выполнить", callback_data: `gdone_${chatId}_${task.id}` }]] }
    }
  );
});

// /grouptasks — список задач группы
bot.onText(/\/grouptasks(?:@\S+)?/, async (msg) => {
  if (!isGroup(msg.chat.id)) return;
  const tasks = await getGroupTasks(msg.chat.id);
  const text  = tasks.length > 0
    ? `📋 Задачи группы (${tasks.length}):\n\n${formatTaskList(tasks)}`
    : "📋 Нет активных задач! 🎉\n\nСоздай: /grouptask Название задачи";

  await bot.sendMessage(msg.chat.id, text, {
    reply_markup: tasks.length > 0 ? {
      inline_keyboard: tasks.slice(0, 5).map(t => ([{
        text: `✅ ${t.title.substring(0, 30)}`,
        callback_data: `gdone_${msg.chat.id}_${t.id}`,
      }])),
    } : undefined,
  });
});

// /groupdone — закрыть задачу группы
bot.onText(/\/groupdone(?:@\S+)?(?:\s+(\d+))?/, async (msg, match) => {
  if (!isGroup(msg.chat.id)) return;
  const tasks = await getGroupTasks(msg.chat.id);
  if (tasks.length === 0) { await bot.sendMessage(msg.chat.id, "🎉 Нет активных задач!"); return; }

  const num = parseInt(match[1]);
  if (num && num >= 1 && num <= tasks.length) {
    const task = tasks[num - 1];
    await markGroupTaskDone(msg.chat.id, task.id, String(msg.from.id), msg.from.first_name);
    await bot.sendMessage(msg.chat.id, `✅ Выполнено: ${task.title} 🎉\n👤 ${msg.from.first_name}`);
    return;
  }

  const keyboard = tasks.slice(0, 10).map((t, i) => ([{
    text: `${i + 1}. ${t.title.substring(0, 35)}`,
    callback_data: `gdone_${msg.chat.id}_${t.id}`,
  }]));
  await bot.sendMessage(msg.chat.id, "✅ Какую задачу отметить выполненной?", {
    reply_markup: { inline_keyboard: keyboard },
  });
});

// /groupinfo
bot.onText(/\/groupinfo(?:@\S+)?/, async (msg) => {
  if (!isGroup(msg.chat.id)) return;
  const chatId = String(msg.chat.id);

  const [tasksAll, membersSnap, wsSnap] = await Promise.all([
    getGroupTasks(chatId, false),
    getDocs(collection(db, "groupWorkspaces", chatId, "members")).catch(() => null),
    getDoc(doc(db, "groupWorkspaces", chatId)),
  ]);

  const active    = tasksAll.filter(t => t.status !== "done").length;
  const done      = tasksAll.filter(t => t.status === "done").length;
  const members   = membersSnap ? membersSnap.size : 0;
  const wsData    = wsSnap.exists() ? wsSnap.data() : {};

  await bot.sendMessage(msg.chat.id,
    `ℹ️ Группа: ${msg.chat.title}\n\n` +
    `👥 Участников: ${members}\n` +
    `📋 Активных задач: ${active}\n` +
    `✅ Выполнено: ${done}\n` +
    `📅 Создано: ${wsData.createdAt ? new Date(wsData.createdAt).toLocaleDateString("ru-RU") : "—"}\n\n` +
    `Команды:\n/grouptask — создать задачу\n/grouptasks — список\n/groupdone — выполнить`,
    getOpenAppButton()
  );
});

// Упоминание бота в группе → создать задачу
bot.on("message", async (msg) => {
  if (!isGroup(msg.chat.id) || !msg.text) return;
  const botInfo = await bot.getMe();
  const mention = `@${botInfo.username}`;
  if (!msg.text.includes(mention)) return;
  if (msg.text.startsWith("/")) return;

  const taskText = msg.text.replace(mention, "").trim();
  if (!taskText || taskText.length < 2) {
    await bot.sendMessage(msg.chat.id,
      `Привет! Напиши задачу после моего имени:\n${mention} Подготовить отчёт к пятнице`);
    return;
  }

  const userId = String(msg.from.id);
  await ensureGroupWorkspace(msg.chat.id, msg.chat.title);
  await addGroupMember(msg.chat.id, userId, { firstName: msg.from.first_name || "", username: msg.from.username || "" });

  const wait   = await bot.sendMessage(msg.chat.id, "⏳ Создаю задачу...", { reply_to_message_id: msg.message_id });
  const parsed = await parseTaskFromText(taskText);

  let assigneeId = null, assigneeName = null;
  if (parsed.assigneeUsername) {
    const user = await getUserByUsername(parsed.assigneeUsername);
    if (user) { assigneeId = user.id; assigneeName = user.firstName || parsed.assigneeUsername; }
  }

  const membersSnap = await getDocs(collection(db, "groupWorkspaces", String(msg.chat.id), "members")).catch(() => null);
  const memberIds = [];
  if (membersSnap) membersSnap.forEach(d => memberIds.push(d.id));

  const task = await createGroupTask(msg.chat.id, {
    ...parsed, createdBy: userId, createdByName: msg.from.first_name || "участник",
    assigneeId, assigneeName, chatTitle: msg.chat.title, memberIds,
  });

  const dueStr = task.dueDate ? `\n⏰ ${formatDateTime(new Date(task.dueDate))}` : "";
  const asStr  = assigneeName ? `\n👤 Для: ${assigneeName}` : "";

  await bot.editMessageText(
    `✅ Задача создана!\n📌 ${task.title}${dueStr}${asStr}`,
    { chat_id: msg.chat.id, message_id: wait.message_id,
      reply_markup: { inline_keyboard: [[{ text: "✅ Выполнить", callback_data: `gdone_${msg.chat.id}_${task.id}` }]] }
    }
  );
});

// ═══════════════════════════════════════════════════════════════
// CALLBACK КНОПКИ
// ═══════════════════════════════════════════════════════════════

bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const userId = String(q.from.id);
  const data   = q.data || "";

  try { await bot.answerCallbackQuery(q.id); } catch {}

  // ── Выполнить личную задачу ────────────────────────────────
  if (data.startsWith("done_")) {
    const taskId = data.replace("done_", "");
    await markTaskDone(userId, taskId);
    await bot.editMessageText(
      `✅ Задача выполнена! 🎉`,
      { chat_id: chatId, message_id: q.message.message_id }
    ).catch(() => {});
    await bot.answerCallbackQuery(q.id, { text: "✅ Выполнено!" });
    return;
  }

  // ── Выполнить групповую задачу ────────────────────────────
  if (data.startsWith("gdone_")) {
    const parts  = data.split("_");
    // gdone_{chatId}_{taskId} — chatId может быть отрицательным
    const taskId = parts[parts.length - 1];
    const gChatId = parts.slice(1, -1).join("_");
    await markGroupTaskDone(gChatId, taskId, userId, q.from.first_name);
    await bot.editMessageText(
      `✅ Выполнено! 🎉\n👤 ${q.from.first_name}`,
      { chat_id: chatId, message_id: q.message.message_id }
    ).catch(() => {});
    return;
  }

  // ── Google Calendar отключить ──────────────────────────────
  if (data === "gcal_disconnect") {
    await setDoc(doc(db, "users", userId, "integrations", "googleCalendar"), { connected: false }, { merge: true });
    await bot.editMessageText("🔌 Google Calendar отключён.", { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
    return;
  }

  // ── Меню подписок ─────────────────────────────────────────
  if (data === "menu_yk") {
    if (!YOOKASSA_PROVIDER_TOKEN) { await bot.sendMessage(chatId, "❌ ЮKassa не настроена."); return; }
    await bot.sendMessage(chatId, "💳 Выбери тариф:", {
      reply_markup: { inline_keyboard: [
        [{ text: "📅 1 месяц — 99 ₽",       callback_data: "buy_yk_month_1" }],
        [{ text: "🗓 3 месяца — 390 ₽",      callback_data: "buy_yk_month_3" }],
        [{ text: "🏆 12 месяцев — 599 ₽ 🔥", callback_data: "buy_yk_month_12" }],
      ]},
    }); return;
  }
  if (data === "menu_stars") {
    await bot.sendMessage(chatId, "⭐ Выбери тариф:", {
      reply_markup: { inline_keyboard: [
        [{ text: "📅 1 месяц — 73 ⭐",       callback_data: "buy_stars_month_1" }],
        [{ text: "🗓 3 месяца — 289 ⭐",      callback_data: "buy_stars_month_3" }],
        [{ text: "🏆 12 месяцев — 430 ⭐ 🔥", callback_data: "buy_stars_month_12" }],
      ]},
    }); return;
  }

  if (data.startsWith("buy_yk_")) {
    const plan = SUBSCRIPTION_PLANS[data.replace("buy_", "")];
    if (!plan || !YOOKASSA_PROVIDER_TOKEN) return;
    try {
      await bot.sendInvoice(chatId,
        `${plan.emoji} Подписка CortexAI — ${plan.label}`,
        `Безлимитные задачи + AI + Мотивация на ${plan.label}`,
        `${data.replace("buy_","")}_${userId}_${Date.now()}`,
        YOOKASSA_PROVIDER_TOKEN, "RUB",
        [{ label: `Подписка на ${plan.label}`, amount: plan.amountKopecks }],
        { need_email: true, send_email_to_provider: true, provider_data: buildProviderData(plan) }
      );
    } catch (e) { await bot.sendMessage(chatId, `❌ Ошибка: ${e.message}`); }
    return;
  }

  if (data.startsWith("buy_stars_")) {
    const plan = SUBSCRIPTION_PLANS[data.replace("buy_", "")];
    if (!plan) return;
    try {
      await bot.sendInvoice(chatId,
        `${plan.emoji} Подписка CortexAI — ${plan.label}`,
        `Безлимитные задачи + AI + Мотивация на ${plan.label}`,
        `${data.replace("buy_","")}_${userId}_${Date.now()}`,
        "", "XTR", [{ label: `Подписка на ${plan.label}`, amount: plan.stars }]
      );
    } catch (e) { await bot.sendMessage(chatId, `❌ Ошибка: ${e.message}`); }
    return;
  }
});

// ═══════════════════════════════════════════════════════════════
// ПЛАТЕЖИ
// ═══════════════════════════════════════════════════════════════

bot.on("pre_checkout_query", async (q) => {
  try { await bot.answerPreCheckoutQuery(q.id, true); }
  catch { try { await bot.answerPreCheckoutQuery(q.id, false, "Ошибка. Попробуй ещё раз."); } catch {} }
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
    const isStars   = payment?.currency === "XTR";
    const amount    = isStars ? `${payment.total_amount} ⭐` : `${(payment.total_amount / 100).toFixed(2)} ₽`;

    await safeSend(userId,
      `✅ Оплата прошла!\n💳 ${isStars ? "Stars" : "ЮKassa"} | 💰 ${amount} | 📅 ${label}\n⏰ До: ${formatDate(expiresAt)}\n\n🚀 Подписка активирована!`,
      getOpenAppButton()
    );

    for (const adminId of ADMINS) {
      safeSend(adminId, `💰 Оплата!\n👤 ${userId}\n${isStars ? "⭐ Stars" : "💳 ЮKassa"} — ${amount} — ${label}`);
    }
  } catch (e) { console.log("successful_payment:", e.message); }
});

// ═══════════════════════════════════════════════════════════════
// КОМАНДЫ АДМИНИСТРАТОРА
// ═══════════════════════════════════════════════════════════════

bot.onText(/\/help/, async (msg) => {
  if (!isAdmin(String(msg.from.id))) return;
  await bot.sendMessage(msg.chat.id,
    `🛠 Команды администратора:\n\n` +
    `/gift [ID] [дни] — выдать подписку\n` +
    `/revoke [ID] — отозвать подписку\n` +
    `/checksub [ID] — проверить подписку\n` +
    `/subscribers — список подписчиков\n` +
    `/stats — статистика\n` +
    `/broadcast [текст] — рассылка всем\n` +
    `/grouplist — список групп с ботом\n` +
    `/myid — мой ID`
  );
});

bot.onText(/\/gift (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const [targetId, daysStr] = match[1].trim().split(/\s+/);
  const days = parseInt(daysStr) || 9999;
  try {
    const exp = await grantSubscription(targetId, days, true);
    await bot.sendMessage(msg.chat.id, `✅ Подписка выдана!\n👤 ${targetId}\n📅 ${days} дн. до ${formatDate(exp)}`);
    safeSend(targetId, `🎁 Тебе выдана подписка CortexAI!\n📅 ${days >= 9999 ? "Бессрочно" : `${days} дней`}\n✅ AI без лимитов 💪`);
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

bot.onText(/\/revoke (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const targetId = match[1].trim();
  try {
    await revokeSubscription(targetId);
    await bot.sendMessage(msg.chat.id, `✅ Подписка отключена у ${targetId}`);
    safeSend(targetId, "❌ Подписка CortexAI отключена.\n\nНапиши /subscribe.");
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

bot.onText(/\/checksub (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const targetId = match[1].trim();
  const info = await getSubInfo(targetId);
  if (!info) { await bot.sendMessage(msg.chat.id, `👤 ${targetId}\n❌ Подписки нет`); return; }
  const daysLeft = info.expiresAt ? Math.ceil((info.expiresAt - new Date()) / 86400000) : 0;
  await bot.sendMessage(msg.chat.id,
    `👤 ${targetId}\n${info.isActive && daysLeft > 0 ? "✅ Активна" : "❌ Неактивна"}\n📅 До: ${info.expiresAt ? formatDate(info.expiresAt) : "—"}\n⏳ Осталось: ${daysLeft > 0 ? `${daysLeft} дн.` : "истекла"}\n🎁 Подарок: ${info.isGift ? "да" : "нет"}`
  );
});

bot.onText(/\/subscribers/, async (msg) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  try {
    const snap = await getDocs(collection(db, "subscriptions"));
    const now = new Date();
    const active = [], expired = [];
    snap.forEach(d => {
      const s = d.data(); if (!s.expiresAt) return;
      const exp = s.expiresAt.toDate();
      const left = Math.ceil((exp - now) / 86400000);
      (s.isActive && left > 0 ? active : expired).push({ ...s, daysLeft: left, expStr: formatDate(exp) });
    });
    active.sort((a, b) => a.daysLeft - b.daysLeft);
    let text = `📊 Подписки\n✅ Активных: ${active.length} | ❌ Истёкших: ${expired.length}\n\n`;
    active.forEach(s => { text += `👤 ${s.userId}\n  📅 До: ${s.expStr} (${s.daysLeft} дн.) ${s.isGift ? "🎁" : "💳"}\n\n`; });
    if (text.length > 4000) text = text.substring(0, 3900) + "\n...";
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
      const s = await getDocs(collection(db, "subscriptions"));
      s.forEach(d => {
        totalSubs++;
        const sub = d.data();
        if (sub.isActive && sub.expiresAt && sub.expiresAt.toDate() > now) activeSubs++;
      });
    } catch {}
    try { groups = (await getDocs(collection(db, "groupWorkspaces"))).size; } catch {}
    try {
      const m = await getDocs(query(collectionGroup(db, "settings"), where("enabled", "==", true)));
      m.forEach(d => { if (d.id === "motivation" && d.data().mode !== "off") motEnabled++; });
    } catch {}
    await bot.sendMessage(msg.chat.id,
      `📈 Статистика CortexAI\n\n👥 Пользователей: ${users}\n💬 Групп: ${groups}\n💳 Подписок: ${totalSubs}\n✅ Активных: ${activeSubs}\n💪 Мотивация: ${motEnabled}\n\n🕐 ${now.toLocaleString("ru-RU")}`
    );
  } catch (e) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${e.message}`); }
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.from.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const text = match[1].trim();
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

// ═══════════════════════════════════════════════════════════════
// AI СЛУШАТЕЛЬ (запросы из webapp)
// ═══════════════════════════════════════════════════════════════

function startAiListener() {
  console.log("AI слушатель запущен ✅");
  const q = query(collection(db, "ai_requests"), where("status", "==", "pending"));

  onSnapshot(q, async (snapshot) => {
    const added = snapshot.docChanges().filter(c => c.type === "added");
    if (!added.length) return;

    for (const change of added) {
      const reqDoc = change.doc;
      const req    = reqDoc.data();
      const reqId  = reqDoc.id;

      try {
        await updateDoc(doc(db, "ai_requests", reqId), { status: "processing", processedAt: new Date().toISOString() });
      } catch { continue; }

      const { userId, message, history, language, tasks } = req;
      const ru = language === "ru";
      const now = new Date();

      const sysPrompt =
        `Ты АИ Агент планировщика CortexAI. Время: ${now.toLocaleString("ru-RU")}.\n` +
        `Задачи: ${tasks?.length > 0 ? tasks.map(t => `${t.title}${t.dueDate ? ` (${formatDateTime(new Date(t.dueDate))})` : ""}`).join(", ") : "нет"}\n\n` +
        `Если хочет создать задачу — добавь в конец:\nTASK_JSON:{"title":"...","dueDate":"ISO или null","priority":"medium","repeat":"none"}\n` +
        `Правила: коротко, ${ru ? "по-русски" : "in English"}, эмодзи.`;

      try {
        const msgs = [{ role: "system", content: sysPrompt }, ...(history || []).slice(-8), { role: "user", content: message }];
        const aiText = await askGroq(msgs, 400);

        let taskCreated = null;
        const match = aiText.match(/TASK_JSON:\s*(\{[\s\S]*?\})\s*$/);
        if (match) {
          try {
            const td = JSON.parse(match[1]);
            if (td.title?.length > 1) {
              const task = await createPersonalTask(userId, {
                title: td.title, dueDate: td.dueDate !== "null" ? td.dueDate : null,
                priority: td.priority || "medium", repeat: td.repeat || "none",
                isAiCreated: true, source: "webapp_ai",
              });
              taskCreated = { id: task.id, title: task.title, dueDate: task.dueDate };
            }
          } catch {}
        }

        const clean = aiText.replace(/TASK_JSON:\s*\{[\s\S]*?\}\s*$/, "").trim();
        await Promise.all([
          setDoc(doc(db, "ai_responses", reqId), { userId, requestId: reqId, message: clean, taskCreated, createdAt: new Date().toISOString(), status: "done" }),
          updateDoc(doc(db, "ai_requests", reqId), { status: "done", completedAt: new Date().toISOString() }),
        ]);
      } catch (e) {
        console.log("AI request error:", e.message);
        await Promise.all([
          setDoc(doc(db, "ai_responses", reqId), { userId, requestId: reqId, message: ru ? "⚠️ Ошибка. Попробуй позже." : "⚠️ Error.", taskCreated: null, createdAt: new Date().toISOString(), status: "error" }),
          updateDoc(doc(db, "ai_requests", reqId), { status: "error", completedAt: new Date().toISOString() }),
        ]);
      }
    }
  }, err => { console.log("AI listener error:", err.message); setTimeout(startAiListener, 5000); });
}

// ═══════════════════════════════════════════════════════════════
// ОЧИСТКА
// ═══════════════════════════════════════════════════════════════

async function cleanupOldData() {
  try {
    const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const twoDaysAgo   = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Старые AI запросы
    try {
      const ai = await getDocs(query(collection(db, "ai_requests"), where("status", "==", "done")));
      for (const d of ai.docs) {
        if (d.data().completedAt && new Date(d.data().completedAt) < twoDaysAgo) {
          await Promise.all([deleteDoc(doc(db, "ai_requests", d.id)), deleteDoc(doc(db, "ai_responses", d.id))]).catch(() => {});
        }
      }
    } catch {}

    // Отправленные напоминания
    try {
      const sent = await getDocs(query(collection(db, "tasks"), where("isSent", "==", true)));
      for (const d of sent.docs) {
        if (d.data().createdAt && new Date(d.data().createdAt) < threeDaysAgo) {
          await deleteDoc(doc(db, "tasks", d.id)).catch(() => {});
        }
      }
    } catch {}

    console.log("✅ Очистка завершена");
  } catch (e) { console.log("cleanupOldData:", e.message); }
}

// ═══════════════════════════════════════════════════════════════
// ЗАПУСК
// ═══════════════════════════════════════════════════════════════

startAiListener();

setInterval(checkReminders,              60 * 1000);
setInterval(checkSubscriptions,      60 * 60 * 1000);
setInterval(sendMotivationNotifications, 60 * 1000);
setInterval(cleanupOldData,       6 * 60 * 60 * 1000);

checkReminders();
checkSubscriptions();

console.log("✅ Все системы CortexAI запущены");
