const TelegramBot = require("node-telegram-bot-api");
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  setDoc,
  doc,
  Timestamp,
  addDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const ADMINS = ["56733076"];
const sentNotifications = new Set();
const sentMotivations = new Set(); // защита от дублирования мотиваций

const YOOKASSA_PROVIDER_TOKEN = process.env.YOOKASSA_PROVIDER_TOKEN || "381764678:TEST:177451";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const SUBSCRIPTION_PLANS = {
  month_1: { label: "1 месяц", days: 30, amountKopecks: 10000, amountRub: "100.00", emoji: "📅" },
  month_6: { label: "6 месяцев", days: 180, amountKopecks: 40000, amountRub: "400.00", emoji: "🗓" },
  month_12: { label: "12 месяцев", days: 365, amountKopecks: 90000, amountRub: "900.00", emoji: "🏆" },
};

// Расписание мотивации по количеству уведомлений в день
const MOTIVATION_SCHEDULES = {
  1: [14],
  2: [10, 19],
  3: [9, 14, 20],
  4: [9, 13, 17, 20],
  5: [8, 11, 14, 17, 20],
};

bot.setMyCommands([
  { command: "start", description: "Запустить бота" },
  { command: "subscribe", description: "Купить подписку" },
  { command: "myid", description: "Узнать свой ID" },
]);

console.log("Бот запущен ✅");

function isAdmin(userId) { return ADMINS.includes(String(userId)); }

async function grantSubscription(userId, days = 30, isGift = false) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  await setDoc(doc(db, "subscriptions", String(userId)), {
    userId: String(userId), isActive: true,
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: Timestamp.fromDate(new Date()),
    isGift, notified3days: false, notified1day: false,
  });
}

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
  await bot.sendMessage(chatId,
    "💎 Выбери тариф подписки CortexAI:\n\n" +
    "📅 1 месяц — 100 ₽\n" +
    "🗓 6 месяцев — 400 ₽ (экономия 200₽)\n" +
    "🏆 12 месяцев — 900 ₽ (экономия 300₽)\n\n" +
    "Все тарифы включают:\n" +
    "✅ Безлимитные задачи\n✅ AI без лимитов\n✅ Мотивационные уведомления\n✅ Напоминания",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📅 1 месяц — 100 ₽", callback_data: "sub_yk_month_1" }],
          [{ text: "🗓 6 месяцев — 400 ₽", callback_data: "sub_yk_month_6" }],
          [{ text: "🏆 12 месяцев — 900 ₽ 🔥", callback_data: "sub_yk_month_12" }],
        ],
      },
    }
  );
}

// ============ GROQ AI ============

async function askGroq(prompt) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY не задан");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.8,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`Groq error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============ МОТИВАЦИЯ ============

async function generateMotivation(userId, mode, tasks) {
  const now = new Date();
  const timeOfDay = now.getHours() < 12 ? "утро" : now.getHours() < 17 ? "день" : "вечер";

  const tasksList = tasks.length > 0
    ? tasks.slice(0, 5).map(t => `- ${t.title}`).join("\n")
    : "задач нет";

  const modeInstructions = {
    soft: "Ты добрый и поддерживающий. Пиши мягко, тепло, с заботой. Никакого давления.",
    normal: "Ты мотивирующий коуч. Пиши энергично, позитивно, конкретно.",
    hard: "Ты требовательный тренер. Пиши прямо, жёстко, без сантиментов. Никакой нецензурной лексики — только честно и по делу.",
  };

  const instruction = modeInstructions[mode] || modeInstructions.normal;

  const prompt = `${instruction}

Сейчас ${timeOfDay}, ${now.toLocaleDateString("ru-RU")}.

Задачи пользователя на сегодня:
${tasksList}

Напиши короткое мотивационное сообщение (2-3 предложения) для человека с учётом его задач и времени суток. 
Без вводных слов типа "Конечно!" или "Вот твоя мотивация:". Сразу сообщение.
Используй 1-2 эмодзи. Только на русском языке.`;

  return await askGroq(prompt);
}

async function sendMotivationNotifications() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().split("T")[0];

    // Получаем всех пользователей
    const usersSnap = await getDocs(collection(db, "users"));

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;

      try {
        // Загружаем настройки мотивации
        const settingsSnap = await getDoc(doc(db, "users", userId, "settings", "motivation"));
        if (!settingsSnap.exists()) continue;

        const settings = settingsSnap.data();
        if (!settings.enabled || settings.mode === "off") continue;

        const timesPerDay = settings.timesPerDay || 3;
        const schedule = MOTIVATION_SCHEDULES[timesPerDay] || MOTIVATION_SCHEDULES[3];

        // Проверяем — нужно ли отправить сейчас
        if (!schedule.includes(currentHour)) continue;

        // Защита от дублирования
        const motivationKey = `motivation_${userId}_${todayStr}_${currentHour}`;
        if (sentMotivations.has(motivationKey)) continue;
        sentMotivations.add(motivationKey);

        // Загружаем задачи пользователя
        const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
        const activeTasks = [];
        tasksSnap.forEach((d) => {
          const data = d.data();
          if (data.status !== "done") activeTasks.push(data);
        });

        // Генерируем мотивацию через Groq
        const motivation = await generateMotivation(userId, settings.mode, activeTasks);
        if (!motivation) continue;

        // Отправляем уведомление с пометкой Мотивация
        await bot.sendMessage(
          userId,
          `💪 Мотивация\n\n${motivation}`
        );

        console.log(`✅ Мотивация отправлена: ${userId} — режим: ${settings.mode}`);
      } catch (err) {
        console.log(`❌ Ошибка мотивации для ${userId}: ${err.message}`);
      }
    }

    // Очищаем старые ключи мотиваций
    if (sentMotivations.size > 10000) {
      const keysToDelete = [];
      sentMotivations.forEach((key) => {
        if (!key.includes(todayStr)) keysToDelete.push(key);
      });
      keysToDelete.forEach((key) => sentMotivations.delete(key));
    }
  } catch (err) {
    console.log("Ошибка отправки мотиваций:", err.message);
  }
}

// ============ КОМАНДЫ ============

bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = String(chatId);
  const param = ((match[1] || "").trim()).replace(/^\//, "");

  if (isAdmin(userId)) { try { await grantSubscription(userId, 3650, true); } catch {} }

  if (param === "subscribe") {
    if (isAdmin(String(chatId))) { bot.sendMessage(chatId, "👑 Ты администратор — подписка бесплатна."); return; }
    await showSubscribeMenu(chatId);
    return;
  }

  bot.sendMessage(chatId,
    "Привет! Я буду напоминать тебе о задачах 🔔\n\n" +
    "Команды:\n/start — запуск\n/subscribe — купить подписку\n/myid — узнать свой ID"
  );
});

bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `Твой Telegram ID: \`${msg.chat.id}\``, { parse_mode: "Markdown" });
});

bot.onText(/\/appss_verify/, (msg) => { bot.sendMessage(msg.chat.id, "appss_73be81"); });

bot.onText(/\/gift (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const targetId = match[1].trim();
  try {
    await grantSubscription(targetId, 3650, true);
    bot.sendMessage(msg.chat.id, `✅ Подписка выдана пользователю ${targetId}`);
    try { bot.sendMessage(targetId, "🎁 Тебе выдана бесплатная подписка CortexAI!\n\n✅ Безлимитные задачи\n✅ AI ассистент\n✅ Мотивационные уведомления"); } catch {}
  } catch (err) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`); }
});

bot.onText(/\/revoke (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const targetId = match[1].trim();
  try {
    await setDoc(doc(db, "subscriptions", String(targetId)), {
      userId: String(targetId), isActive: false, updatedAt: Timestamp.fromDate(new Date()),
    });
    bot.sendMessage(msg.chat.id, `✅ Подписка отключена у ${targetId}`);
    try { bot.sendMessage(targetId, "❌ Твоя подписка CortexAI была отключена."); } catch {}
  } catch (err) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`); }
});

bot.onText(/\/subscribers/, async (msg) => {
  if (!isAdmin(String(msg.chat.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  try {
    const subsSnap = await getDocs(collection(db, "subscriptions"));
    const now = new Date();
    const activeList = [], expiredList = [];
    subsSnap.forEach((subDoc) => {
      const sub = subDoc.data();
      if (!sub.expiresAt) return;
      const expiresAt = sub.expiresAt.toDate();
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      if (sub.isActive && daysLeft > 0) activeList.push({ userId: sub.userId, daysLeft, isGift: sub.isGift || false, expiresAt: expiresAt.toLocaleDateString("ru-RU") });
      else expiredList.push({ userId: sub.userId, expiresAt: expiresAt.toLocaleDateString("ru-RU") });
    });
    let response = `📊 Подписки:\n\n✅ Активных: ${activeList.length}\n❌ Истёкших: ${expiredList.length}\n\n`;
    activeList.forEach((s) => { response += `👤 ${s.userId}\n   📅 До: ${s.expiresAt} (${s.daysLeft} дн.) ${s.isGift ? "🎁" : "💳"}\n\n`; });
    expiredList.slice(0, 5).forEach((s) => { response += `👤 ${s.userId} — ${s.expiresAt}\n`; });
    bot.sendMessage(msg.chat.id, response || "Подписчиков нет.");
  } catch (err) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`); }
});

bot.onText(/\/stats/, async (msg) => {
  if (!isAdmin(String(msg.chat.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  try {
    const subsSnap = await getDocs(collection(db, "subscriptions"));
    const usersSnap = await getDocs(collection(db, "users"));
    const now = new Date();
    let activeSubs = 0, totalSubs = 0, totalTasks = 0, motivationEnabled = 0;

    subsSnap.forEach((s) => {
      totalSubs++;
      const sub = s.data();
      if (sub.isActive && sub.expiresAt && Math.ceil((sub.expiresAt.toDate() - now) / (1000 * 60 * 60 * 24)) > 0) activeSubs++;
    });

    for (const userDoc of usersSnap.docs) {
      const t = await getDocs(collection(db, "users", userDoc.id, "tasks"));
      totalTasks += t.size;
      try {
        const motSnap = await getDoc(doc(db, "users", userDoc.id, "settings", "motivation"));
        if (motSnap.exists() && motSnap.data().enabled && motSnap.data().mode !== "off") motivationEnabled++;
      } catch {}
    }

    bot.sendMessage(msg.chat.id,
      `📈 Статистика:\n\n👥 Пользователей: ${totalSubs}\n✅ Активных подписок: ${activeSubs}\n📋 Задач: ${totalTasks}\n💪 Мотивация включена: ${motivationEnabled}`
    );
  } catch (err) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`); }
});

bot.onText(/\/help/, (msg) => {
  if (!isAdmin(String(msg.chat.id))) return;
  bot.sendMessage(msg.chat.id,
    `🛠 Команды:\n\n/gift [ID] — выдать подписку\n/revoke [ID] — отозвать\n/subscribers — список\n/stats — статистика\n/myid — мой ID`
  );
});

bot.onText(/\/subscribe$/, async (msg) => {
  const chatId = msg.chat.id;
  if (isAdmin(String(chatId))) { bot.sendMessage(chatId, "👑 Ты администратор — подписка бесплатна."); return; }
  await showSubscribeMenu(chatId);
});

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = String(chatId);
  const data = callbackQuery.data;
  await bot.answerCallbackQuery(callbackQuery.id);

  if (!data.startsWith("sub_yk_")) return;
  const planKey = data.replace("sub_yk_", "");
  const plan = SUBSCRIPTION_PLANS[planKey];
  if (!plan) return;

  if (!YOOKASSA_PROVIDER_TOKEN) { await bot.sendMessage(chatId, "❌ ЮKassa не настроена."); return; }

  try {
    const payload = `sub_yk_${planKey}_${userId}_${Date.now()}`;
    const providerData = buildProviderData(plan);
    await bot.sendInvoice(
      chatId,
      `${plan.emoji} Подписка CortexAI — ${plan.label}`,
      `Безлимитные задачи + AI + Мотивация на ${plan.label}`,
      payload, YOOKASSA_PROVIDER_TOKEN, "RUB",
      [{ label: `Подписка CortexAI на ${plan.label}`, amount: plan.amountKopecks }],
      { need_email: true, send_email_to_provider: true, provider_data: providerData, need_phone_number: false, send_phone_number_to_provider: false, need_shipping_address: false, is_flexible: false }
    );
    console.log(`📄 Инвойс: ${userId} — ${plan.label} — ${plan.amountRub}₽`);
  } catch (err) {
    console.log(`❌ Ошибка sendInvoice: ${err.message}`);
    await bot.sendMessage(chatId, `❌ Ошибка создания счёта: ${err.message}`);
  }
});

bot.on("pre_checkout_query", async (query) => {
  try { await bot.answerPreCheckoutQuery(query.id, true); } catch (err) {
    try { await bot.answerPreCheckoutQuery(query.id, false, "Ошибка обработки."); } catch {}
  }
});

bot.on("successful_payment", async (msg) => {
  const userId = String(msg.chat.id);
  const payment = msg.successful_payment;
  const payload = payment?.invoice_payload || "";

  try {
    let days = 30, planLabel = "1 месяц";
    if (payload.includes("month_12")) { days = 365; planLabel = "12 месяцев"; }
    else if (payload.includes("month_6")) { days = 180; planLabel = "6 месяцев"; }

    await grantSubscription(userId, days, false);

    const amountRub = `${(payment.total_amount / 100).toFixed(2)} ₽`;
    await bot.sendMessage(msg.chat.id,
      `✅ Оплата прошла!\n\n💳 ЮKassa\n💰 ${amountRub}\n📅 ${planLabel}\n\n🚀 Подписка активирована!\n• Безлимитные задачи\n• AI без лимитов\n• Мотивационные уведомления\n\nЧек придёт на почту.`
    );

    for (const adminId of ADMINS) {
      try { await bot.sendMessage(adminId, `💰 Оплата!\n\n👤 ${userId}\n💳 ЮKassa\n💰 ${amountRub}\n📅 ${planLabel}`); } catch {}
    }
  } catch (err) { console.log("Ошибка активации:", err.message); }
});

// ============ AI СЛУШАТЕЛЬ ============

function startAiListener() {
  console.log("AI слушатель запущен ✅");
  const q = query(collection(db, "ai_requests"), where("status", "==", "pending"));

  onSnapshot(q, async (snapshot) => {
    const newDocs = snapshot.docChanges().filter((c) => c.type === "added");
    if (newDocs.length === 0) return;

    for (const change of newDocs) {
      const requestDoc = change.doc;
      const request = requestDoc.data();
      const requestId = requestDoc.id;

      try { await updateDoc(doc(db, "ai_requests", requestId), { status: "processing", processedAt: new Date().toISOString() }); } catch { continue; }

      const { userId, message, history, language, tasks } = request;
      const ru = language === "ru";
      const now = new Date();

      const systemPrompt = `Ты AI ассистент планировщика CortexAI. Время: ${now.toLocaleString("ru-RU")}.

Задачи: ${tasks && tasks.length > 0 ? tasks.map(t => `${t.title}${t.dueDate ? ` (${new Date(t.dueDate).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}`).join(", ") : "нет"}

Если пользователь хочет создать задачу — добавь в конец:
TASK_JSON:{"title":"название","dueDate":"ISO_дата_или_null","priority":"medium","repeat":"none"}

Правила: коротко, ${ru ? "по-русски" : "in English"}, эмодзи, dueDate=null если нет времени.`;

      try {
        const recentHistory = (history || []).slice(-6);
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: systemPrompt }, ...recentHistory], max_tokens: 400, temperature: 0.6 }),
        });

        const groqData = await groqResponse.json();
        const aiResponse = groqData.choices?.[0]?.message?.content || "Нет ответа";

        let taskCreated = null;
        const taskJsonMatch = aiResponse.match(/TASK_JSON:(\{[^}]+\})/);
        if (taskJsonMatch) {
          try {
            const taskData = JSON.parse(taskJsonMatch[1]);
            if (taskData.title && taskData.title.length > 1) {
              const taskId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
              const nowIso = new Date().toISOString();
              const taskForSync = {
                id: taskId, title: taskData.title, description: "", dueDate: taskData.dueDate || null,
                priority: taskData.priority || "medium", status: "todo", isAiCreated: true,
                createdAt: nowIso, updatedAt: nowIso, notified: false, repeat: taskData.repeat || "none",
                category: "", type: "task", items: [], userId, isSent: false,
                reminderAt: taskData.dueDate ? Timestamp.fromDate(new Date(taskData.dueDate)) : null,
              };
              const saves = [setDoc(doc(db, "users", userId, "tasks", taskId), taskForSync)];
              if (taskData.dueDate) {
                const dueDate = new Date(taskData.dueDate);
                if (!isNaN(dueDate.getTime())) {
                  saves.push(addDoc(collection(db, "tasks"), {
                    userId, taskId, title: taskData.title, description: "", dueDate: taskData.dueDate,
                    priority: taskData.priority || "medium", status: "todo", createdAt: nowIso, isSent: false,
                    reminderAt: Timestamp.fromDate(dueDate), repeat: taskData.repeat || "none", type: "task",
                  }));
                }
              }
              await Promise.all(saves);
              taskCreated = { id: taskId, title: taskData.title, dueDate: taskData.dueDate || null };
            }
          } catch {}
        }

        const cleanResponse = aiResponse.replace(/TASK_JSON:\{[^}]+\}/, "").trim();
        await Promise.all([
          setDoc(doc(db, "ai_responses", requestId), { userId, requestId, message: cleanResponse, taskCreated, createdAt: new Date().toISOString(), status: "done" }),
          updateDoc(doc(db, "ai_requests", requestId), { status: "done", completedAt: new Date().toISOString() }),
        ]);
      } catch (err) {
        await Promise.all([
          setDoc(doc(db, "ai_responses", requestId), { userId, requestId, message: ru ? "⚠️ Ошибка. Попробуй позже." : "⚠️ Error. Try again.", taskCreated: null, createdAt: new Date().toISOString(), status: "error" }),
          updateDoc(doc(db, "ai_requests", requestId), { status: "error", completedAt: new Date().toISOString() }),
        ]);
      }
    }
  }, (error) => { console.log("Ошибка AI:", error.message); setTimeout(startAiListener, 3000); });
}

// ============ НАПОМИНАНИЯ ============

async function checkReminders() {
  try {
    const now = new Date();
    const q = query(collection(db, "tasks"), where("isSent", "==", false), where("reminderAt", "<=", Timestamp.fromDate(now)));
    const snapshot = await getDocs(q);

    for (const documentSnapshot of snapshot.docs) {
      const taskId = documentSnapshot.id;
      if (sentNotifications.has(taskId)) continue;
      sentNotifications.add(taskId);

      const task = documentSnapshot.data();
      try {
        await updateDoc(doc(db, "tasks", taskId), { isSent: true });
        if (task.status === "done") continue;
        await bot.sendMessage(task.userId, `🔔 Напоминание!\n\n📌 ${task.title}${task.description ? `\n${task.description}` : ""}${task.repeat === "daily" ? "\n\n🔁 Ежедневная задача" : ""}`);
        if (task.repeat === "daily" && task.status !== "done") await createNextDailyTask(task);
        console.log(`✅ Уведомление: ${task.userId} — ${task.title}`);
      } catch (err) { console.log(`❌ Ошибка: ${err.message}`); }
    }
    if (sentNotifications.size > 1000) sentNotifications.clear();
  } catch (err) { console.log(`Ошибка напоминаний: ${err.message}`); }
}

async function createNextDailyTask(task) {
  try {
    const nextDate = new Date(task.reminderAt.toDate());
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split("T")[0];
    const existing = await getDocs(query(collection(db, "tasks"), where("userId", "==", task.userId), where("title", "==", task.title), where("repeat", "==", "daily"), where("isSent", "==", false)));
    let exists = false;
    existing.forEach((d) => { if (d.data().dueDate?.startsWith(nextDateStr)) exists = true; });
    if (exists) return;
    await addDoc(collection(db, "tasks"), {
      userId: task.userId, taskId: `daily_${Date.now()}`, title: task.title,
      description: task.description || "", dueDate: nextDate.toISOString(),
      priority: task.priority || "medium", status: "todo", createdAt: new Date().toISOString(),
      isSent: false, reminderAt: Timestamp.fromDate(nextDate), repeat: "daily",
    });
  } catch (err) { console.log(`Ошибка daily: ${err.message}`); }
}

async function checkSubscriptions() {
  try {
    const now = new Date();
    const subsSnap = await getDocs(collection(db, "subscriptions"));
    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data();
      if (!sub.isActive || !sub.expiresAt) continue;
      const expiresAt = sub.expiresAt.toDate();
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      if (daysLeft === 3 && !sub.notified3days) {
        try { await bot.sendMessage(sub.userId, "⚠️ Подписка заканчивается через 3 дня!\n\nНапиши /subscribe для продления 🚀"); await updateDoc(doc(db, "subscriptions", subDoc.id), { notified3days: true }); } catch {}
      }
      if (daysLeft === 1 && !sub.notified1day) {
        try { await bot.sendMessage(sub.userId, "🚨 Подписка заканчивается ЗАВТРА!\n\nНапиши /subscribe ⚡"); await updateDoc(doc(db, "subscriptions", subDoc.id), { notified1day: true }); } catch {}
      }
      if (daysLeft <= 0 && sub.isActive) {
        try { await updateDoc(doc(db, "subscriptions", subDoc.id), { isActive: false }); await bot.sendMessage(sub.userId, "❌ Подписка истекла.\n\nНапиши /subscribe."); } catch {}
      }
    }
  } catch (err) { console.log("Ошибка подписок:", err.message); }
}

async function checkBirthdays() {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    const todayStr = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const usersSnap = await getDocs(collection(db, "users"));
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const birthdaysSnap = await getDocs(collection(db, "users", userId, "birthdays"));
      for (const bdDoc of birthdaysSnap.docs) {
        const bd = bdDoc.data();
        if (bd.date === tomorrowStr) { try { await bot.sendMessage(userId, `🎂 Завтра день рождения у ${bd.name}! 🎉`); } catch {} }
        if (bd.date === todayStr) { try { await bot.sendMessage(userId, `🎉 Сегодня день рождения у ${bd.name}! 🎂🥳`); } catch {} }
      }
    }
  } catch (err) { console.log("Ошибка дней рождения:", err.message); }
}

async function cleanupOldDoneTasks() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const usersSnap = await getDocs(collection(db, "users"));
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      try {
        const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
        for (const taskDoc of tasksSnap.docs) {
          const data = taskDoc.data();
          if (data.status === "done" && data.completedAt && new Date(data.completedAt) < yesterday) {
            try { await deleteDoc(doc(db, "users", userId, "tasks", taskDoc.id)); } catch {}
          }
        }
      } catch {}
    }
    try {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const aiSnap = await getDocs(query(collection(db, "ai_requests"), where("status", "==", "done")));
      for (const d of aiSnap.docs) {
        const data = d.data();
        if (data.completedAt && new Date(data.completedAt) < twoDaysAgo) {
          try { await Promise.all([deleteDoc(doc(db, "ai_requests", d.id)), deleteDoc(doc(db, "ai_responses", d.id))]); } catch {}
        }
      }
    } catch {}
    console.log("✅ Очистка завершена");
  } catch (err) { console.log("Ошибка очистки:", err.message); }
}

startAiListener();

setInterval(checkReminders, 60 * 1000);
setInterval(checkSubscriptions, 60 * 60 * 1000);
setInterval(checkBirthdays, 60 * 60 * 1000);
setInterval(cleanupOldDoneTasks, 6 * 60 * 60 * 1000);

// Проверка мотивации каждую минуту (отправляет только в нужные часы)
setInterval(sendMotivationNotifications, 60 * 1000);

console.log("Все интервалы запущены ✅");
