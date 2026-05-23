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
  collectionGroup,
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
if (!token) {
  console.error("❌ BOT_TOKEN не задан! Выход.");
  process.exit(1);
}
const bot = new TelegramBot(token, { polling: true });

// ============ КОНФИГУРАЦИЯ ============

const ADMINS = ["56733076"]; // ID администраторов
const sentNotifications = new Set();
const sentMotivations = new Set();

const YOOKASSA_PROVIDER_TOKEN =
  process.env.YOOKASSA_PROVIDER_TOKEN || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WEBAPP_URL = process.env.WEBAPP_URL || "";

const SUBSCRIPTION_PLANS = {
  yk_month_1:     { label: "1 месяц",    days: 30,  amountKopecks: 9900,  amountRub: "99.00",  emoji: "📅", type: "yk" },
  yk_month_3:     { label: "3 месяца",   days: 90,  amountKopecks: 39000, amountRub: "390.00", emoji: "🗓", type: "yk" },
  yk_month_12:    { label: "12 месяцев", days: 365, amountKopecks: 59900, amountRub: "599.00", emoji: "🏆", type: "yk" },
  stars_month_1:  { label: "1 месяц",    days: 30,  stars: 73,  emoji: "📅", type: "stars" },
  stars_month_3:  { label: "3 месяца",   days: 90,  stars: 289, emoji: "🗓", type: "stars" },
  stars_month_12: { label: "12 месяцев", days: 365, stars: 430, emoji: "🏆", type: "stars" },
};

const MOTIVATION_SCHEDULES = {
  1: [14],
  2: [10, 19],
  3: [9, 14, 20],
  4: [9, 13, 17, 20],
  5: [8, 11, 14, 17, 20],
};

// ============ ИНИЦИАЛИЗАЦИЯ ============

bot.setMyCommands([
  { command: "start",           description: "Запустить бота" },
  { command: "subscribe",       description: "Купить подписку" },
  { command: "myid",            description: "Узнать свой ID" },
  { command: "test_motivation", description: "Тест мотивации" },
]);

console.log("Бот запущен ✅");
console.log("GROQ_API_KEY:",         GROQ_API_KEY          ? "задан ✅" : "не задан ❌");
console.log("YOOKASSA_PROVIDER_TOKEN:", YOOKASSA_PROVIDER_TOKEN ? "задан ✅" : "не задан ⚠️");
console.log("WEBAPP_URL:",            WEBAPP_URL            || "НЕ ЗАДАН ⚠️");
console.log("ADMINS:",                ADMINS.join(", "));

// ============ УТИЛИТЫ ============

function isAdmin(userId) {
  return ADMINS.includes(String(userId));
}

function getOpenAppButton() {
  if (WEBAPP_URL && WEBAPP_URL.startsWith("https://") && !WEBAPP_URL.includes("t.me")) {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Открыть CortexAI", web_app: { url: WEBAPP_URL } }],
        ],
      },
    };
  }
  return {};
}

function formatDate(date) {
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ============ ПОДПИСКА ============

async function grantSubscription(userId, days = 30, isGift = false) {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + days);

  // Проверяем существующую подписку — если активна, продлеваем от неё
  try {
    const existing = await getDoc(doc(db, "subscriptions", String(userId)));
    if (existing.exists()) {
      const data = existing.data();
      if (data.isActive && data.expiresAt) {
        const existingExpiry = data.expiresAt.toDate();
        if (existingExpiry > now) {
          // Продлеваем от текущей даты истечения
          expiresAt.setTime(existingExpiry.getTime());
          expiresAt.setDate(expiresAt.getDate() + days);
        }
      }
    }
  } catch {}

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
  await setDoc(
    doc(db, "subscriptions", String(userId)),
    {
      userId: String(userId),
      isActive: false,
      updatedAt: Timestamp.fromDate(new Date()),
    },
    { merge: true }
  );
}

async function getSubscriptionInfo(userId) {
  try {
    const snap = await getDoc(doc(db, "subscriptions", String(userId)));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      isActive: data.isActive || false,
      expiresAt: data.expiresAt ? data.expiresAt.toDate() : null,
      isGift: data.isGift || false,
    };
  } catch {
    return null;
  }
}

function buildProviderData(plan) {
  return JSON.stringify({
    receipt: {
      items: [{
        description: `Подписка CortexAI на ${plan.label}`,
        quantity: 1,
        amount: { value: plan.amountRub, currency: "RUB" },
        vat_code: 1,
        payment_mode: "full_payment",
        payment_subject: "service",
      }],
      tax_system_code: 1,
    },
  });
}

async function showSubscribeMenu(chatId) {
  const ykText = YOOKASSA_PROVIDER_TOKEN
    ? "💳 Оплата рублями (ЮKassa):\n  📅 1 месяц — 99 ₽\n  🗓 3 месяца — 390 ₽\n  🏆 12 месяцев — 599 ₽\n\n"
    : "";
  const ykBtn = YOOKASSA_PROVIDER_TOKEN
    ? [[{ text: "💳 Оплата рублями (ЮKassa)", callback_data: "menu_yk" }]]
    : [];

  await bot.sendMessage(
    chatId,
    `💎 Подписка CortexAI\n\n${ykText}⭐ Оплата Telegram Stars:\n  📅 1 месяц — 73 звезды\n  🗓 3 месяца — 289 звёзд\n  🏆 12 месяцев — 430 звёзд\n\nВсе тарифы включают:\n✅ Безлимитные задачи\n✅ AI без лимитов\n✅ Мотивационные уведомления\n✅ Цели на неделю`,
    {
      reply_markup: {
        inline_keyboard: [
          ...ykBtn,
          [{ text: "⭐ Оплата Stars", callback_data: "menu_stars" }],
        ],
      },
    }
  );
}

// ============ GROQ AI ============

async function askGroq(prompt, maxTokens = 200) {
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY не задан");
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.85,
        stream: false,
      }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq ${response.status}: ${err}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// ============ МОТИВАЦИЯ ============

const FALLBACK_MOTIVATIONS = {
  soft: [
    "🌸 Ты делаешь всё что можешь — это уже здорово!",
    "💙 Каждый маленький шаг важен. Продолжай в своём темпе.",
    "🌿 Ты заслуживаешь заботы о себе. Сегодня тоже хороший день.",
    "✨ Верь в себя. Ты справишься со всем что запланировал.",
  ],
  normal: [
    "⚡ У тебя есть задачи — значит есть цель. Вперёд!",
    "🎯 Фокус на одной задаче за раз. Ты точно справишься!",
    "💪 Действие создаёт мотивацию. Начни прямо сейчас!",
    "🚀 Сегодня хороший день чтобы сделать что-то важное!",
  ],
  hard: [
    "🔥 Хватит откладывать. Задачи сами себя не выполнят.",
    "💢 Ты знаешь что нужно делать — так делай это уже!",
    "⚡ Никаких оправданий. Только результат. Вперёд.",
    "🏆 Победители не ждут нужного настроения — они просто делают.",
  ],
};

async function generateMotivation(userId, mode, tasks) {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? "утро" : hour < 17 ? "день" : "вечер";

  const tasksList =
    tasks.length > 0
      ? tasks
          .slice(0, 5)
          .map(
            (t) =>
              `- ${t.title}${
                t.dueDate
                  ? ` (до ${new Date(t.dueDate).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })})`
                  : ""
              }`
          )
          .join("\n")
      : "задач нет";

  const modeInstructions = {
    soft:   "Ты добрый поддерживающий друг. Пиши тепло, мягко, с заботой. Никакого давления.",
    normal: "Ты энергичный мотивационный коуч. Пиши позитивно, конкретно, с энтузиазмом.",
    hard:   "Ты требовательный тренер. Пиши прямо, честно, требовательно. БЕЗ нецензурных слов.",
  };

  const instruction = modeInstructions[mode] || modeInstructions.normal;

  const prompt =
    `${instruction}\n\n` +
    `Сейчас ${timeOfDay}, ${now.toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })}.\n\n` +
    `Задачи пользователя:\n${tasksList}\n\n` +
    `Напиши короткое мотивационное сообщение (2-3 предложения) с учётом задач и времени суток.\n` +
    `НЕ начинай с "Конечно!", "Вот:", "Привет!" — сразу пиши сообщение.\n` +
    `Используй 1-2 эмодзи. Только на русском языке.`;

  try {
    const result = await askGroq(prompt, 200);
    return result || null;
  } catch (err) {
    console.log(`Groq ошибка: ${err.message} — используем fallback`);
    return null;
  }
}

async function sendMotivationNotifications() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().split("T")[0];

    let settingsSnap;
    let useCollectionGroup = true;

    try {
      settingsSnap = await getDocs(
        query(
          collectionGroup(db, "settings"),
          where("enabled", "==", true)
        )
      );
    } catch (e) {
      console.log("collectionGroup не сработал, используем fallback:", e.message);
      useCollectionGroup = false;
    }

    if (!useCollectionGroup || settingsSnap.empty) {
      await sendMotivationFallback(currentHour, todayStr);
      return;
    }

    let processed = 0;
    for (const settingDoc of settingsSnap.docs) {
      if (settingDoc.id !== "motivation") continue;
      const settings = settingDoc.data();
      if (!settings.enabled || settings.mode === "off") continue;

      const pathParts = settingDoc.ref.path.split("/");
      if (pathParts.length < 4) continue;
      const userId = pathParts[1];

      await processMotivationForUser(userId, settings, currentHour, todayStr);
      processed++;
    }

    if (processed > 0) {
      console.log(`💪 Мотивация обработана для ${processed} пользователей`);
    }

    // Очистка старых ключей
    if (sentMotivations.size > 5000) {
      const toDelete = [];
      sentMotivations.forEach((key) => {
        if (!key.includes(todayStr)) toDelete.push(key);
      });
      toDelete.forEach((key) => sentMotivations.delete(key));
    }
  } catch (err) {
    console.log("❌ Ошибка sendMotivationNotifications:", err.message);
  }
}

async function sendMotivationFallback(currentHour, todayStr) {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      try {
        const settingSnap = await getDoc(
          doc(db, "users", userId, "settings", "motivation")
        );
        if (!settingSnap.exists()) continue;
        const settings = settingSnap.data();
        if (!settings.enabled || settings.mode === "off") continue;
        await processMotivationForUser(userId, settings, currentHour, todayStr);
      } catch {}
    }
  } catch (err) {
    console.log("Ошибка fallback мотивации:", err.message);
  }
}

async function processMotivationForUser(userId, settings, currentHour, todayStr) {
  try {
    const timesPerDay = settings.timesPerDay || 3;
    const schedule = MOTIVATION_SCHEDULES[timesPerDay] || MOTIVATION_SCHEDULES[3];

    if (!schedule.includes(currentHour)) return;

    const motivationKey = `mot_${userId}_${todayStr}_${currentHour}`;
    if (sentMotivations.has(motivationKey)) return;
    sentMotivations.add(motivationKey);

    console.log(`💪 Отправляю мотивацию: ${userId}, режим: ${settings.mode}, час: ${currentHour}`);

    const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
    const activeTasks = [];
    tasksSnap.forEach((d) => {
      const data = d.data();
      if (data.status !== "done" && data.title) activeTasks.push(data);
    });

    let motivation = await generateMotivation(userId, settings.mode, activeTasks);

    if (!motivation) {
      const fallbackList = FALLBACK_MOTIVATIONS[settings.mode] || FALLBACK_MOTIVATIONS.normal;
      motivation = fallbackList[Math.floor(Math.random() * fallbackList.length)];
    }

    if (!motivation) return;

    await bot.sendMessage(userId, `💪 Мотивация\n\n${motivation}`);
    console.log(`✅ Мотивация отправлена: ${userId}`);
  } catch (err) {
    console.log(`❌ Ошибка мотивации для ${userId}: ${err.message}`);

    // Если бот заблокирован — отключаем мотивацию
    if (
      err.response?.statusCode === 403 ||
      err.message?.includes("403") ||
      err.message?.includes("blocked") ||
      err.message?.includes("deactivated")
    ) {
      try {
        await setDoc(
          doc(db, "users", userId, "settings", "motivation"),
          { enabled: false },
          { merge: true }
        );
        console.log(`⚠️ Мотивация отключена для ${userId} (бот заблокирован)`);
      } catch {}
    }
  }
}

// ============ КОМАНДЫ ПОЛЬЗОВАТЕЛЯ ============

bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = String(chatId);
  const param = ((match[1] || "").trim()).replace(/^\//, "");

  // Регистрируем пользователя
  try {
    await setDoc(
      doc(db, "users", userId),
      {
        userId,
        chatId: userId,
        firstName:  msg.from.first_name  || "",
        lastName:   msg.from.last_name   || "",
        username:   msg.from.username    || "",
        startedAt:  new Date().toISOString(),
        lastSeen:   new Date().toISOString(),
      },
      { merge: true }
    );
    console.log(`✅ User started: ${userId} (${msg.from.first_name})`);
  } catch (err) {
    console.log(`❌ Ошибка сохранения пользователя: ${err.message}`);
  }

  // Авто-подписка для администраторов
  if (isAdmin(userId)) {
    try {
      await grantSubscription(userId, 3650, true);
      console.log(`👑 Авто-подписка выдана администратору: ${userId}`);
    } catch {}
  }

  // Обработка параметра
  if (param === "subscribe") {
    if (isAdmin(userId)) {
      await bot.sendMessage(chatId, "👑 Ты администратор — подписка уже активна бесплатно.");
      return;
    }
    await showSubscribeMenu(chatId);
    return;
  }

  // Стандартное приветствие
  const appInfo = WEBAPP_URL
    ? "\n\n🔗 Открой приложение через меню кнопку ниже!"
    : "\n\n📱 Открой приложение через Telegram Mini Apps!";

  await bot.sendMessage(
    chatId,
    `Привет, ${msg.from.first_name || "друг"}! 👋\n\n` +
    `Я бот CortexAI — твой умный планировщик.\n\n` +
    `Я буду присылать:\n` +
    `🔔 Напоминания о задачах\n` +
    `💪 Мотивационные сообщения\n` +
    `⭐ Уведомления о подписке\n` +
    `🎂 Напоминания о днях рождения` +
    appInfo,
    getOpenAppButton()
  );
});

bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🆔 Твой Telegram ID: \`${msg.chat.id}\``,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/appss_verify/, (msg) => {
  bot.sendMessage(msg.chat.id, "appss_73be81");
});

bot.onText(/\/subscribe$/, async (msg) => {
  const chatId = msg.chat.id;
  if (isAdmin(String(chatId))) {
    await bot.sendMessage(chatId, "👑 Ты администратор — подписка уже активна бесплатно.");
    return;
  }
  await showSubscribeMenu(chatId);
});

bot.onText(/\/test_motivation/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(chatId);

  try {
    const settingSnap = await getDoc(
      doc(db, "users", userId, "settings", "motivation")
    );

    if (!settingSnap.exists()) {
      await bot.sendMessage(
        chatId,
        "❌ Настройки мотивации не найдены.\n\n" +
        "Открой приложение → вкладка AI → нажми ⚙️ → включи мотивацию и нажми «Сохранить».\n\n" +
        "⚠️ При сохранении Telegram спросит разрешение — нажми «Разрешить»!"
      );
      return;
    }

    const settings = settingSnap.data();
    await bot.sendMessage(
      chatId,
      `🔍 Настройки мотивации:\n` +
      `• Режим: ${settings.mode}\n` +
      `• Включено: ${settings.enabled ? "да ✅" : "нет ❌"}\n` +
      `• В день: ${settings.timesPerDay}×\n\n` +
      `Генерирую тестовую мотивацию...`
    );

    const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
    const activeTasks = [];
    tasksSnap.forEach((d) => {
      const data = d.data();
      if (data.status !== "done") activeTasks.push(data);
    });

    let motivation = await generateMotivation(userId, settings.mode || "normal", activeTasks);

    if (!motivation) {
      const fallbackList = FALLBACK_MOTIVATIONS[settings.mode] || FALLBACK_MOTIVATIONS.normal;
      motivation = fallbackList[Math.floor(Math.random() * fallbackList.length)];
    }

    await bot.sendMessage(chatId, `💪 Мотивация (тест)\n\n${motivation}`);
  } catch (err) {
    bot.sendMessage(chatId, `❌ Ошибка теста: ${err.message}`);
  }
});

// ============ КОМАНДЫ АДМИНИСТРАТОРА ============

bot.onText(/\/help/, async (msg) => {
  if (!isAdmin(String(msg.chat.id))) return;
  await bot.sendMessage(
    msg.chat.id,
    `🛠 Команды администратора:\n\n` +
    `/gift [ID] [дни] — выдать подписку (по умолчанию 9999 дней)\n` +
    `/revoke [ID] — отозвать подписку\n` +
    `/checksub [ID] — проверить подписку пользователя\n` +
    `/subscribers — список активных подписчиков\n` +
    `/stats — статистика\n` +
    `/broadcast [текст] — рассылка всем пользователям\n` +
    `/myid — мой ID\n` +
    `/test_motivation — тест мотивации`,
    { parse_mode: "Markdown" }
  );
});

// Выдача подписки: /gift [ID] [дни]
bot.onText(/\/gift (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав администратора.");
    return;
  }

  const parts = match[1].trim().split(/\s+/);
  const targetId = parts[0];
  const days = parseInt(parts[1]) || 9999;

  if (!targetId || isNaN(parseInt(targetId))) {
    bot.sendMessage(msg.chat.id, "❌ Неверный формат. Используй: /gift [ID] [дни]");
    return;
  }

  try {
    const expiresAt = await grantSubscription(targetId, days, true);
    const expiryStr = formatDate(expiresAt);

    await bot.sendMessage(
      msg.chat.id,
      `✅ Подписка выдана!\n👤 Пользователь: ${targetId}\n📅 Дней: ${days}\n⏰ Действует до: ${expiryStr}`
    );

    // Уведомляем пользователя
    try {
      await bot.sendMessage(
        targetId,
        `🎁 Тебе выдана подписка CortexAI!\n\n` +
        `📅 Действует: ${days >= 9999 ? "бессрочно" : `${days} дней (до ${expiryStr})`}\n\n` +
        `✅ Безлимитные задачи\n✅ AI без лимитов\n✅ Мотивация 💪`
      );
    } catch (notifyErr) {
      await bot.sendMessage(
        msg.chat.id,
        `⚠️ Подписка выдана, но уведомить пользователя не удалось: ${notifyErr.message}`
      );
    }
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка выдачи подписки: ${err.message}`);
  }
});

// Отзыв подписки: /revoke [ID]
bot.onText(/\/revoke (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав администратора.");
    return;
  }

  const targetId = match[1].trim();

  if (!targetId || isNaN(parseInt(targetId))) {
    bot.sendMessage(msg.chat.id, "❌ Неверный формат. Используй: /revoke [ID]");
    return;
  }

  try {
    await revokeSubscription(targetId);
    await bot.sendMessage(
      msg.chat.id,
      `✅ Подписка отключена у пользователя ${targetId}`
    );

    // Уведомляем пользователя
    try {
      await bot.sendMessage(
        targetId,
        `❌ Твоя подписка CortexAI отключена.\n\nЧтобы оформить подписку, напиши /subscribe`
      );
    } catch (notifyErr) {
      await bot.sendMessage(
        msg.chat.id,
        `⚠️ Подписка отключена, но уведомить пользователя не удалось: ${notifyErr.message}`
      );
    }
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка отзыва подписки: ${err.message}`);
  }
});

// Проверка подписки: /checksub [ID]
bot.onText(/\/checksub (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав администратора.");
    return;
  }

  const targetId = match[1].trim();

  try {
    const info = await getSubscriptionInfo(targetId);
    if (!info) {
      await bot.sendMessage(msg.chat.id, `👤 Пользователь ${targetId}\n❌ Подписки не найдено`);
      return;
    }

    const now = new Date();
    const daysLeft = info.expiresAt
      ? Math.ceil((info.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    await bot.sendMessage(
      msg.chat.id,
      `👤 Пользователь: ${targetId}\n` +
      `💳 Статус: ${info.isActive && daysLeft > 0 ? "✅ Активна" : "❌ Неактивна"}\n` +
      `📅 Истекает: ${info.expiresAt ? formatDate(info.expiresAt) : "—"}\n` +
      `⏳ Осталось: ${daysLeft > 0 ? `${daysLeft} дн.` : "истекла"}\n` +
      `🎁 Подарочная: ${info.isGift ? "да" : "нет"}`
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

// Список подписчиков: /subscribers
bot.onText(/\/subscribers/, async (msg) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав администратора.");
    return;
  }

  try {
    const subsSnap = await getDocs(collection(db, "subscriptions"));
    const now = new Date();
    const activeList = [];
    const expiredList = [];

    subsSnap.forEach((d) => {
      const sub = d.data();
      if (!sub.expiresAt) return;

      const expiresAt = sub.expiresAt.toDate();
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (sub.isActive && daysLeft > 0) {
        activeList.push({
          userId:    sub.userId,
          daysLeft,
          isGift:    sub.isGift || false,
          expiresAt: formatDate(expiresAt),
        });
      } else {
        expiredList.push({
          userId:    sub.userId,
          expiresAt: formatDate(expiresAt),
        });
      }
    });

    // Сортируем по оставшимся дням
    activeList.sort((a, b) => a.daysLeft - b.daysLeft);

    let response =
      `📊 Подписки CortexAI\n\n` +
      `✅ Активных: ${activeList.length}\n` +
      `❌ Истёкших: ${expiredList.length}\n\n`;

    if (activeList.length > 0) {
      response += `📋 Активные:\n`;
      activeList.forEach((s) => {
        response += `👤 ${s.userId}\n  📅 До: ${s.expiresAt} (${s.daysLeft} дн.) ${s.isGift ? "🎁" : "💳"}\n\n`;
      });
    }

    if (expiredList.length > 0 && expiredList.length <= 10) {
      response += `📋 Истёкшие:\n`;
      expiredList.slice(0, 5).forEach((s) => {
        response += `👤 ${s.userId} — ${s.expiresAt}\n`;
      });
      if (expiredList.length > 5) response += `...и ещё ${expiredList.length - 5}\n`;
    }

    // Telegram ограничивает длину сообщения — разбиваем если нужно
    if (response.length > 4000) {
      response = response.substring(0, 3900) + "\n\n...сообщение обрезано";
    }

    await bot.sendMessage(msg.chat.id, response || "Подписчиков нет.");
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

// Статистика: /stats
bot.onText(/\/stats/, async (msg) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав администратора.");
    return;
  }

  try {
    const now = new Date();
    let activeSubs = 0;
    let totalSubs = 0;
    let giftSubs = 0;

    try {
      const subsSnap = await getDocs(collection(db, "subscriptions"));
      subsSnap.forEach((s) => {
        totalSubs++;
        const sub = s.data();
        if (sub.isGift) giftSubs++;
        if (
          sub.isActive &&
          sub.expiresAt &&
          Math.ceil((sub.expiresAt.toDate().getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) > 0
        ) {
          activeSubs++;
        }
      });
    } catch {}

    let motivationEnabled = 0;
    try {
      const motSnap = await getDocs(
        query(collectionGroup(db, "settings"), where("enabled", "==", true))
      );
      motSnap.forEach((d) => {
        if (d.id === "motivation" && d.data().mode !== "off") motivationEnabled++;
      });
    } catch {}

    let totalUsers = 0;
    try {
      const usersSnap = await getDocs(collection(db, "users"));
      totalUsers = usersSnap.size;
    } catch {}

    let pendingReminders = 0;
    try {
      const remSnap = await getDocs(
        query(collection(db, "tasks"), where("isSent", "==", false))
      );
      pendingReminders = remSnap.size;
    } catch {}

    await bot.sendMessage(
      msg.chat.id,
      `📈 Статистика CortexAI\n\n` +
      `👥 Всего пользователей: ${totalUsers}\n` +
      `💳 Записей подписок: ${totalSubs}\n` +
      `✅ Активных подписок: ${activeSubs}\n` +
      `🎁 Подарочных: ${giftSubs}\n` +
      `💪 Мотивация включена: ${motivationEnabled}\n` +
      `🔔 Напоминаний в очереди: ${pendingReminders}\n\n` +
      `🕐 Время: ${now.toLocaleString("ru-RU")}`
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

// Рассылка: /broadcast [текст]
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав администратора.");
    return;
  }

  const text = match[1].trim();
  if (!text) {
    bot.sendMessage(msg.chat.id, "❌ Укажи текст рассылки.");
    return;
  }

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    let sent = 0;
    let failed = 0;

    await bot.sendMessage(
      msg.chat.id,
      `📤 Начинаю рассылку ${usersSnap.size} пользователям...`
    );

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      try {
        await bot.sendMessage(userId, `📢 ${text}`);
        sent++;
        // Задержка чтобы не превысить лимиты Telegram
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        failed++;
      }
    }

    await bot.sendMessage(
      msg.chat.id,
      `✅ Рассылка завершена!\n📤 Отправлено: ${sent}\n❌ Ошибок: ${failed}`
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка рассылки: ${err.message}`);
  }
});

// ============ CALLBACK КНОПКИ ============

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = String(chatId);
  const data = callbackQuery.data;

  try {
    await bot.answerCallbackQuery(callbackQuery.id);
  } catch {}

  if (data === "menu_yk") {
    if (!YOOKASSA_PROVIDER_TOKEN) {
      await bot.sendMessage(chatId, "❌ Оплата рублями временно недоступна.");
      return;
    }
    await bot.sendMessage(chatId, "💳 Оплата рублями — выбери тариф:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📅 1 месяц — 99 ₽",       callback_data: "buy_yk_month_1" }],
          [{ text: "🗓 3 месяца — 390 ₽",      callback_data: "buy_yk_month_3" }],
          [{ text: "🏆 12 месяцев — 599 ₽ 🔥", callback_data: "buy_yk_month_12" }],
        ],
      },
    });
    return;
  }

  if (data === "menu_stars") {
    await bot.sendMessage(chatId, "⭐ Оплата Telegram Stars — выбери тариф:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📅 1 месяц — 73 ⭐",       callback_data: "buy_stars_month_1" }],
          [{ text: "🗓 3 месяца — 289 ⭐",      callback_data: "buy_stars_month_3" }],
          [{ text: "🏆 12 месяцев — 430 ⭐ 🔥", callback_data: "buy_stars_month_12" }],
        ],
      },
    });
    return;
  }

  if (data.startsWith("buy_yk_")) {
    const planKey = data.replace("buy_", "");
    const plan = SUBSCRIPTION_PLANS[planKey];
    if (!plan) return;

    if (!YOOKASSA_PROVIDER_TOKEN) {
      await bot.sendMessage(chatId, "❌ ЮKassa не настроена. Попробуй оплату Stars.");
      return;
    }

    try {
      const payload = `${planKey}_${userId}_${Date.now()}`;
      const providerData = buildProviderData(plan);
      await bot.sendInvoice(
        chatId,
        `${plan.emoji} Подписка CortexAI — ${plan.label}`,
        `Безлимитные задачи + AI + Мотивация на ${plan.label}`,
        payload,
        YOOKASSA_PROVIDER_TOKEN,
        "RUB",
        [{ label: `Подписка CortexAI на ${plan.label}`, amount: plan.amountKopecks }],
        {
          need_email: true,
          send_email_to_provider: true,
          provider_data: providerData,
          need_phone_number: false,
          send_phone_number_to_provider: false,
          need_shipping_address: false,
          is_flexible: false,
        }
      );
      console.log(`📄 ЮKassa инвойс: ${userId} — ${plan.label}`);
    } catch (err) {
      console.log(`❌ Ошибка sendInvoice ЮKassa: ${err.message}`);
      await bot.sendMessage(chatId, `❌ Ошибка создания счёта. Попробуй позже или используй Stars.`);
    }
    return;
  }

  if (data.startsWith("buy_stars_")) {
    const planKey = data.replace("buy_", "");
    const plan = SUBSCRIPTION_PLANS[planKey];
    if (!plan) return;

    try {
      const payload = `${planKey}_${userId}_${Date.now()}`;
      await bot.sendInvoice(
        chatId,
        `${plan.emoji} Подписка CortexAI — ${plan.label}`,
        `Безлимитные задачи + AI + Мотивация на ${plan.label}`,
        payload,
        "",
        "XTR",
        [{ label: `Подписка CortexAI на ${plan.label}`, amount: plan.stars }]
      );
      console.log(`📄 Stars инвойс: ${userId} — ${plan.label}`);
    } catch (err) {
      console.log(`❌ Ошибка sendInvoice Stars: ${err.message}`);
      await bot.sendMessage(chatId, `❌ Ошибка: ${err.message}`);
    }
    return;
  }
});

// ============ ОБРАБОТКА ПЛАТЕЖЕЙ ============

bot.on("pre_checkout_query", async (query) => {
  try {
    await bot.answerPreCheckoutQuery(query.id, true);
  } catch (err) {
    console.log("pre_checkout_query error:", err.message);
    try {
      await bot.answerPreCheckoutQuery(query.id, false, "Ошибка обработки платежа. Попробуй ещё раз.");
    } catch {}
  }
});

bot.on("successful_payment", async (msg) => {
  const userId = String(msg.chat.id);
  const payment = msg.successful_payment;
  const payload = payment?.invoice_payload || "";

  console.log(`💰 Оплата: ${userId} — ${payload} — ${payment?.currency} — ${payment?.total_amount}`);

  try {
    let days = 30;
    let planLabel = "1 месяц";

    if (payload.includes("month_12")) { days = 365; planLabel = "12 месяцев"; }
    else if (payload.includes("month_3")) { days = 90;  planLabel = "3 месяца"; }
    else if (payload.includes("month_1")) { days = 30;  planLabel = "1 месяц"; }

    const expiresAt = await grantSubscription(userId, days, false);
    const expiryStr = formatDate(expiresAt);

    const isStars = payment?.currency === "XTR";
    const amountStr = isStars
      ? `${payment.total_amount} ⭐`
      : `${(payment.total_amount / 100).toFixed(2)} ₽`;

    await bot.sendMessage(
      msg.chat.id,
      `✅ Оплата успешно прошла!\n\n` +
      `💳 Способ: ${isStars ? "Telegram Stars" : "ЮKassa"}\n` +
      `💰 Сумма: ${amountStr}\n` +
      `📅 Тариф: ${planLabel}\n` +
      `⏰ Действует до: ${expiryStr}\n\n` +
      `🚀 Подписка CortexAI активирована!\n` +
      `• Безлимитные задачи\n` +
      `• AI без лимитов\n` +
      `• Мотивационные уведомления\n` +
      `• Цели на неделю\n\n` +
      `${isStars ? "" : "📧 Чек придёт на указанную почту."}`,
      getOpenAppButton()
    );

    // Уведомляем администраторов
    for (const adminId of ADMINS) {
      try {
        await bot.sendMessage(
          adminId,
          `💰 Новая оплата!\n👤 ${userId}\n💳 ${isStars ? "Stars" : "ЮKassa"}\n💰 ${amountStr}\n📅 ${planLabel}`
        );
      } catch {}
    }
  } catch (err) {
    console.log("Ошибка активации подписки:", err.message);
    // Не теряем платёж — пробуем повторно
    try {
      await grantSubscription(userId, 30, false);
      await bot.sendMessage(
        msg.chat.id,
        "✅ Платёж принят! Подписка активирована. Если возникли проблемы — напишите в поддержку."
      );
    } catch {}
  }
});

// ============ AI СЛУШАТЕЛЬ (обработка запросов из webapp) ============

function startAiListener() {
  console.log("AI слушатель запущен ✅");
  const q = query(
    collection(db, "ai_requests"),
    where("status", "==", "pending")
  );

  onSnapshot(
    q,
    async (snapshot) => {
      const newDocs = snapshot.docChanges().filter((c) => c.type === "added");
      if (newDocs.length === 0) return;

      for (const change of newDocs) {
        const requestDoc = change.doc;
        const request = requestDoc.data();
        const requestId = requestDoc.id;

        // Помечаем как "в обработке"
        try {
          await updateDoc(doc(db, "ai_requests", requestId), {
            status: "processing",
            processedAt: new Date().toISOString(),
          });
        } catch {
          continue;
        }

        const { userId, message, history, language, tasks } = request;
        const ru = language === "ru";
        const now = new Date();

        const systemPrompt =
          `Ты АИ Агент планировщика CortexAI. Время: ${now.toLocaleString("ru-RU")}.\n\n` +
          `Задачи: ${
            tasks && tasks.length > 0
              ? tasks
                  .map(
                    (t) =>
                      `${t.title}${
                        t.dueDate
                          ? ` (${new Date(t.dueDate).toLocaleString("ru-RU", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })})`
                          : ""
                      }`
                  )
                  .join(", ")
              : "нет"
          }\n\n` +
          `Если хочет создать задачу — добавь в самый конец:\n` +
          `TASK_JSON:{"title":"название","dueDate":"ISO_или_null","priority":"medium","repeat":"none"}\n\n` +
          `Правила: коротко, ${ru ? "по-русски" : "in English"}, эмодзи, dueDate=null если нет времени.`;

        try {
          const recentHistory = (history || []).slice(-8);
          const groqResponse = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${GROQ_API_KEY}`,
              },
              body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                  { role: "system", content: systemPrompt },
                  ...recentHistory,
                ],
                max_tokens: 400,
                temperature: 0.6,
              }),
            }
          );

          const groqData = await groqResponse.json();
          const aiResponse = groqData.choices?.[0]?.message?.content || "Нет ответа";

          // Парсим задачу — улучшенный regex
          let taskCreated = null;
          const taskJsonMatch = aiResponse.match(/TASK_JSON:\s*(\{[\s\S]*?\})\s*$/);
          if (taskJsonMatch) {
            try {
              const taskData = JSON.parse(taskJsonMatch[1]);
              if (taskData.title && taskData.title.length > 1) {
                const taskId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                const nowIso = new Date().toISOString();
                const taskForSync = {
                  id: taskId,
                  title: taskData.title,
                  description: "",
                  dueDate: taskData.dueDate && taskData.dueDate !== "null" ? taskData.dueDate : null,
                  priority: taskData.priority || "medium",
                  status: "todo",
                  isAiCreated: true,
                  createdAt: nowIso,
                  updatedAt: nowIso,
                  notified: false,
                  repeat: taskData.repeat || "none",
                  category: "",
                  type: "task",
                  items: [],
                  userId,
                  isSent: false,
                  reminderAt: taskData.dueDate && taskData.dueDate !== "null"
                    ? Timestamp.fromDate(new Date(taskData.dueDate))
                    : null,
                };

                const saves = [
                  setDoc(doc(db, "users", userId, "tasks", taskId), taskForSync),
                ];

                if (taskData.dueDate && taskData.dueDate !== "null") {
                  const dueDate = new Date(taskData.dueDate);
                  if (!isNaN(dueDate.getTime()) && dueDate > new Date()) {
                    saves.push(
                      addDoc(collection(db, "tasks"), {
                        userId,
                        taskId,
                        title: taskData.title,
                        description: "",
                        dueDate: taskData.dueDate,
                        priority: taskData.priority || "medium",
                        status: "todo",
                        createdAt: nowIso,
                        isSent: false,
                        reminderAt: Timestamp.fromDate(dueDate),
                        repeat: taskData.repeat || "none",
                        type: "task",
                      })
                    );
                  }
                }

                await Promise.all(saves);
                taskCreated = {
                  id: taskId,
                  title: taskData.title,
                  dueDate: taskData.dueDate || null,
                };
              }
            } catch (parseErr) {
              console.log("TASK_JSON parse error:", parseErr.message);
            }
          }

          const cleanResponse = aiResponse
            .replace(/TASK_JSON:\s*\{[\s\S]*?\}\s*$/, "")
            .trim();

          await Promise.all([
            setDoc(doc(db, "ai_responses", requestId), {
              userId,
              requestId,
              message: cleanResponse,
              taskCreated,
              createdAt: new Date().toISOString(),
              status: "done",
            }),
            updateDoc(doc(db, "ai_requests", requestId), {
              status: "done",
              completedAt: new Date().toISOString(),
            }),
          ]);
        } catch (err) {
          console.log("AI request error:", err.message);
          await Promise.all([
            setDoc(doc(db, "ai_responses", requestId), {
              userId,
              requestId,
              message: ru
                ? "⚠️ Ошибка. Попробуй позже."
                : "⚠️ Error. Try again.",
              taskCreated: null,
              createdAt: new Date().toISOString(),
              status: "error",
            }),
            updateDoc(doc(db, "ai_requests", requestId), {
              status: "error",
              completedAt: new Date().toISOString(),
            }),
          ]);
        }
      }
    },
    (error) => {
      console.log("Ошибка AI слушателя:", error.message);
      // Перезапускаем через 5 секунд
      setTimeout(startAiListener, 5000);
    }
  );
}

// ============ НАПОМИНАНИЯ ============

async function checkReminders() {
  try {
    const now = new Date();
    const q = query(
      collection(db, "tasks"),
      where("isSent", "==", false),
      where("reminderAt", "<=", Timestamp.fromDate(now))
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    console.log(`🔔 Найдено ${snapshot.size} напоминаний`);

    for (const documentSnapshot of snapshot.docs) {
      const taskId = documentSnapshot.id;
      if (sentNotifications.has(taskId)) continue;
      sentNotifications.add(taskId);

      const task = documentSnapshot.data();

      try {
        await updateDoc(doc(db, "tasks", taskId), { isSent: true });

        if (task.status === "done") continue;
        if (!task.userId) continue;

        // Обновляем статус в коллекции пользователя
        if (task.taskId) {
          updateDoc(
            doc(db, "users", task.userId, "tasks", task.taskId),
            { notified: true, updatedAt: new Date().toISOString() }
          ).catch(() => {});
        }

        await bot.sendMessage(
          task.userId,
          `🔔 Напоминание!\n\n` +
          `📌 ${task.title}` +
          `${task.description ? `\n${task.description}` : ""}` +
          `${
            task.repeat && task.repeat !== "none"
              ? `\n\n🔁 ${task.repeat === "daily" ? "Ежедневная задача" : "Повторяющаяся задача"}`
              : ""
          }`
        );

        if (task.repeat === "daily" && task.status !== "done") {
          await createNextDailyTask(task);
        }

        console.log(`✅ Напоминание отправлено: ${task.userId} — ${task.title}`);
      } catch (err) {
        console.log(`❌ Ошибка напоминания для ${task.userId}: ${err.message}`);
        // Если бот заблокирован — пропускаем
      }
    }

    if (sentNotifications.size > 2000) sentNotifications.clear();
  } catch (err) {
    console.log(`Ошибка checkReminders: ${err.message}`);
  }
}

async function createNextDailyTask(task) {
  try {
    const nextDate = new Date(task.reminderAt.toDate());
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split("T")[0];

    // Проверяем что задача на завтра ещё не создана
    const existing = await getDocs(
      query(
        collection(db, "tasks"),
        where("userId", "==", task.userId),
        where("title", "==", task.title),
        where("repeat", "==", "daily"),
        where("isSent", "==", false)
      )
    );

    let exists = false;
    existing.forEach((d) => {
      if (d.data().dueDate?.startsWith(nextDateStr)) exists = true;
    });
    if (exists) return;

    await addDoc(collection(db, "tasks"), {
      userId:      task.userId,
      taskId:      `daily_${Date.now()}`,
      title:       task.title,
      description: task.description || "",
      dueDate:     nextDate.toISOString(),
      priority:    task.priority || "medium",
      status:      "todo",
      createdAt:   new Date().toISOString(),
      isSent:      false,
      reminderAt:  Timestamp.fromDate(nextDate),
      repeat:      "daily",
    });

    console.log(`🔁 Daily задача на ${nextDateStr}: ${task.title}`);
  } catch (err) {
    console.log(`Ошибка createNextDailyTask: ${err.message}`);
  }
}

// ============ УПРАВЛЕНИЕ ПОДПИСКАМИ ============

async function checkSubscriptions() {
  try {
    const now = new Date();
    const subsSnap = await getDocs(collection(db, "subscriptions"));

    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data();
      if (!sub.isActive || !sub.expiresAt || !sub.userId) continue;

      const expiresAt = sub.expiresAt.toDate();
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysLeft === 3 && !sub.notified3days) {
        try {
          await bot.sendMessage(
            sub.userId,
            `⚠️ Твоя подписка CortexAI заканчивается через 3 дня!\n\nНапиши /subscribe для продления 🚀`
          );
          await updateDoc(doc(db, "subscriptions", subDoc.id), { notified3days: true });
        } catch {}
      }

      if (daysLeft === 1 && !sub.notified1day) {
        try {
          await bot.sendMessage(
            sub.userId,
            `🚨 Твоя подписка CortexAI заканчивается ЗАВТРА!\n\nНапиши /subscribe чтобы продлить ⚡`
          );
          await updateDoc(doc(db, "subscriptions", subDoc.id), { notified1day: true });
        } catch {}
      }

      if (daysLeft <= 0 && sub.isActive) {
        try {
          await updateDoc(doc(db, "subscriptions", subDoc.id), { isActive: false });
          await bot.sendMessage(
            sub.userId,
            `❌ Твоя подписка CortexAI истекла.\n\nНапиши /subscribe для продления.`
          );
        } catch {}
      }
    }
  } catch (err) {
    console.log("Ошибка checkSubscriptions:", err.message);
  }
}

// ============ ДНИ РОЖДЕНИЯ ============

async function checkBirthdays() {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowStr = `${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    const todayStr    = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const usersSnap = await getDocs(collection(db, "users"));
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const birthdaysSnap = await getDocs(
        collection(db, "users", userId, "birthdays")
      );
      for (const bdDoc of birthdaysSnap.docs) {
        const bd = bdDoc.data();
        if (bd.date === tomorrowStr) {
          try {
            await bot.sendMessage(userId, `🎂 Завтра день рождения у ${bd.name}! 🎉`);
          } catch {}
        }
        if (bd.date === todayStr) {
          try {
            await bot.sendMessage(userId, `🎉 Сегодня день рождения у ${bd.name}! 🎂🥳`);
          } catch {}
        }
      }
    }
  } catch (err) {
    console.log("Ошибка checkBirthdays:", err.message);
  }
}

// ============ ОЧИСТКА ДАННЫХ ============

async function cleanupOldDoneTasks() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Очищаем выполненные задачи пользователей
    const usersSnap = await getDocs(collection(db, "users"));
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      try {
        const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
        for (const taskDoc of tasksSnap.docs) {
          const data = taskDoc.data();
          if (
            data.status === "done" &&
            data.completedAt &&
            new Date(data.completedAt) < yesterday
          ) {
            try {
              await deleteDoc(doc(db, "users", userId, "tasks", taskDoc.id));
            } catch {}
          }
        }
      } catch {}
    }

    // Очищаем старые AI запросы
    try {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const aiSnap = await getDocs(
        query(collection(db, "ai_requests"), where("status", "==", "done"))
      );
      for (const d of aiSnap.docs) {
        const data = d.data();
        if (data.completedAt && new Date(data.completedAt) < twoDaysAgo) {
          try {
            await Promise.all([
              deleteDoc(doc(db, "ai_requests", d.id)),
              deleteDoc(doc(db, "ai_responses", d.id)),
            ]);
          } catch {}
        }
      }
    } catch {}

    // Очищаем отправленные напоминания
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const sentTasksSnap = await getDocs(
        query(collection(db, "tasks"), where("isSent", "==", true))
      );
      for (const d of sentTasksSnap.docs) {
        const data = d.data();
        if (data.createdAt && new Date(data.createdAt) < threeDaysAgo) {
          try {
            await deleteDoc(doc(db, "tasks", d.id));
          } catch {}
        }
      }
    } catch {}

    console.log("✅ Очистка завершена");
  } catch (err) {
    console.log("Ошибка cleanupOldDoneTasks:", err.message);
  }
}

// ============ ЗАПУСК ВСЕХ СИСТЕМ ============

startAiListener();

setInterval(checkReminders,              60 * 1000);           // каждую минуту
setInterval(checkSubscriptions,          60 * 60 * 1000);      // каждый час
setInterval(checkBirthdays,             60 * 60 * 1000);       // каждый час
setInterval(cleanupOldDoneTasks,     6 * 60 * 60 * 1000);      // каждые 6 часов
setInterval(sendMotivationNotifications, 60 * 1000);           // каждую минуту

// Запуск сразу при старте
checkReminders();
checkSubscriptions();

console.log("✅ Все системы CortexAI запущены");
