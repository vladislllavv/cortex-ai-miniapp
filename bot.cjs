const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  setDoc,
  getDoc,
  doc,
  Timestamp,
  addDoc,
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyASx0saii-gMIHmCC_e3i7gAIqL6NxUMZ4",
  authDomain: "cortexai-65075.firebaseapp.com",
  projectId: "cortexai-65075",
  storageBucket: "cortexai-65075.firebasestorage.app",
  messagingSenderId: "417649566965",
  appId: "1:417649566965:web:f36c20a9e7af9a77da91bc"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const ADMINS = ["56733076"];

bot.setMyCommands([
  { command: "start", description: "Запустить бота" },
  { command: "subscribe", description: "Купить подписку" },
  { command: "myid", description: "Узнать свой ID" },
]);

console.log("Бот запущен ✅");

function isAdmin(userId) {
  return ADMINS.includes(String(userId));
}

async function grantSubscription(userId, days = 30, isGift = false) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  await setDoc(doc(db, "subscriptions", String(userId)), {
    userId: String(userId),
    isActive: true,
    expiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: Timestamp.fromDate(new Date()),
    isGift,
  });
}

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(chatId);
  if (isAdmin(userId)) {
    try { await grantSubscription(userId, 3650, true); } catch {}
  }
  bot.sendMessage(chatId,
    "Привет! Я буду напоминать тебе о задачах 🔔\n\n" +
    "Команды:\n/start — запуск\n/subscribe — купить подписку\n/myid — узнать свой ID"
  );
});

// /myid
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `Твой Telegram ID: \`${msg.chat.id}\``, { parse_mode: "Markdown" });
});

// /appss_verify
bot.onText(/\/appss_verify/, (msg) => {
  bot.sendMessage(msg.chat.id, "appss_73be81");
});

// /gift
bot.onText(/\/gift (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав.");
    return;
  }
  const targetId = match[1].trim();
  try {
    await grantSubscription(targetId, 3650, true);
    bot.sendMessage(msg.chat.id, `✅ Подписка выдана пользователю ${targetId}`);
    try { bot.sendMessage(targetId, "🎁 Тебе выдана бесплатная подписка CortexAI!\n\n✅ Безлимитные задачи\n✅ AI ассистент"); } catch {}
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

// /revoke
bot.onText(/\/revoke (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав.");
    return;
  }
  const targetId = match[1].trim();
  try {
    await setDoc(doc(db, "subscriptions", String(targetId)), {
      userId: String(targetId), isActive: false,
      updatedAt: Timestamp.fromDate(new Date()),
    });
    bot.sendMessage(msg.chat.id, `✅ Подписка отключена у ${targetId}`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

// /subscribe
bot.onText(/\/subscribe/, async (msg) => {
  const chatId = msg.chat.id;
  if (isAdmin(String(chatId))) {
    bot.sendMessage(chatId, "👑 Ты администратор — подписка бесплатна.");
    return;
  }
  try {
    await bot.sendInvoice(chatId, "Подписка CortexAI 🚀",
      "Безлимитные задачи + AI ассистент на 30 дней",
      `sub_${chatId}`, "", "XTR",
      [{ label: "Подписка на 30 дней", amount: 100 }]
    );
  } catch (err) {
    bot.sendMessage(chatId, "Ошибка при создании счёта. Попробуй позже.");
  }
});

bot.on("pre_checkout_query", (query) => {
  bot.answerPreCheckoutQuery(query.id, true);
});

bot.on("successful_payment", async (msg) => {
  const userId = String(msg.chat.id);
  try {
    await grantSubscription(userId, 30, false);
    bot.sendMessage(msg.chat.id,
      "✅ Подписка активирована!\n\n🚀 Доступны:\n• Безлимитные задачи\n• AI ассистент\n\nПодписка действует 30 дней."
    );
  } catch (err) {
    console.log("Ошибка активации подписки:", err.message);
  }
});

// Создать повторяющуюся задачу
async function createNextDailyTask(task) {
  try {
    const oldDate = task.reminderAt.toDate();
    const nextDate = new Date(oldDate);
    nextDate.setDate(nextDate.getDate() + 1);
    await addDoc(collection(db, "tasks"), {
      userId: task.userId,
      taskId: `daily_${Date.now()}`,
      title: task.title,
      description: task.description || "",
      dueDate: nextDate.toISOString(),
      priority: task.priority || "medium",
      status: "todo",
      createdAt: new Date().toISOString(),
      isSent: false,
      reminderAt: Timestamp.fromDate(nextDate),
      repeat: "daily",
    });
  } catch (err) {
    console.log("Ошибка создания повторяющейся задачи:", err.message);
  }
}

// Проверка напоминаний
async function checkReminders() {
  try {
    const now = new Date();
    const q = query(
      collection(db, "tasks"),
      where("isSent", "==", false),
      where("reminderAt", "<=", Timestamp.fromDate(now))
    );
    const snapshot = await getDocs(q);

    for (const documentSnapshot of snapshot.docs) {
      const task = documentSnapshot.data();
      try {
        await bot.sendMessage(
          task.userId,
          `🔔 Напоминание!\n\n📌 ${task.title}${task.description ? `\n${task.description}` : ""}${task.repeat === "daily" ? "\n\n🔁 Ежедневная задача" : ""}`
        );
        await updateDoc(doc(db, "tasks", documentSnapshot.id), { isSent: true });
        if (task.repeat === "daily") await createNextDailyTask(task);
      } catch (err) {
        console.log(`Ошибка отправки: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`Ошибка проверки: ${err.message}`);
  }
}

// Проверка подписки (за 3 дня до окончания)
async function checkSubscriptions() {
  try {
    const now = new Date();
    const in3days = new Date(now);
    in3days.setDate(in3days.getDate() + 3);

    const subsSnap = await getDocs(collection(db, "subscriptions"));

    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data();
      if (!sub.isActive || !sub.expiresAt) continue;

      const expiresAt = sub.expiresAt.toDate();
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

      if (daysLeft === 3 && !sub.notified3days) {
        try {
          await bot.sendMessage(
            sub.userId,
            `⚠️ Твоя подписка CortexAI заканчивается через 3 дня!\n\n📅 Дата окончания: ${expiresAt.toLocaleDateString("ru-RU")}\n\nНапиши /subscribe для продления 🚀`
          );
          await updateDoc(doc(db, "subscriptions", subDoc.id), { notified3days: true });
        } catch {}
      }

      if (daysLeft === 1 && !sub.notified1day) {
        try {
          await bot.sendMessage(
            sub.userId,
            `🚨 Подписка CortexAI заканчивается ЗАВТРА!\n\nНапиши /subscribe для продления ⚡`
          );
          await updateDoc(doc(db, "subscriptions", subDoc.id), { notified1day: true });
        } catch {}
      }
    }
  } catch (err) {
    console.log("Ошибка проверки подписок:", err.message);
  }
}

// Проверка дней рождения
async function checkBirthdays() {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowMonth = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const tomorrowDay = String(tomorrow.getDate()).padStart(2, "0");
    const tomorrowStr = `${tomorrowMonth}-${tomorrowDay}`;

    const todayMonth = String(now.getMonth() + 1).padStart(2, "0");
    const todayDay = String(now.getDate()).padStart(2, "0");
    const todayStr = `${todayMonth}-${todayDay}`;

    // Получаем всех пользователей
    const usersSnap = await getDocs(collection(db, "users"));

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const birthdaysSnap = await getDocs(collection(db, "users", userId, "birthdays"));

      for (const bdDoc of birthdaysSnap.docs) {
        const bd = bdDoc.data();

        // За день до ДР
        if (bd.date === tomorrowStr) {
          try {
            await bot.sendMessage(userId, `🎂 Завтра день рождения у ${bd.name}!\n\nНе забудь поздравить! 🎉`);
          } catch {}
        }

        // В день ДР
        if (bd.date === todayStr) {
          try {
            await bot.sendMessage(userId, `🎉 Сегодня день рождения у ${bd.name}!\n\nПоздравь прямо сейчас! 🎂🥳`);
          } catch {}
        }
      }
    }
  } catch (err) {
    console.log("Ошибка проверки дней рождения:", err.message);
  }
}

// Запуск проверок
setInterval(checkReminders, 60 * 1000);           // каждую минуту
setInterval(checkSubscriptions, 60 * 60 * 1000);   // каждый час
setInterval(checkBirthdays, 60 * 60 * 1000);       // каждый час
