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
  addDoc,
  doc,
  Timestamp
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

// Список администраторов
const ADMINS = ["56733076"];

bot.setMyCommands([
  { command: "start", description: "Запустить бота" },
  { command: "subscribe", description: "Купить подписку" }
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
    isGift: isGift
  });
}

// /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(chatId);

  if (isAdmin(userId)) {
    try {
      await grantSubscription(userId, 3650, true);
    } catch (err) {
      console.log("Ошибка авто-выдачи подписки админу:", err.message);
    }
  }

  bot.sendMessage(
    chatId,
    "Привет! Я буду напоминать тебе о задачах 🔔\n\nКоманды:\n/start — запуск\n/subscribe — купить подписку\n/myid — узнать свой ID"
  );
});

// /appss_verify
bot.onText(/\/appss_verify/, (msg) => {
  bot.sendMessage(msg.chat.id, "appss_73be81");
});

// /myid
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `Твой Telegram ID: ${msg.chat.id}`);
});

// /gift
bot.onText(/\/gift (.+)/, async (msg, match) => {
  const senderId = String(msg.chat.id);

  if (!isAdmin(senderId)) {
    bot.sendMessage(msg.chat.id, "❌ У тебя нет прав для этой команды.");
    return;
  }

  const targetUserId = match[1].trim();

  try {
    await grantSubscription(targetUserId, 3650, true);
    await bot.sendMessage(msg.chat.id, `✅ Подписка выдана пользователю ${targetUserId}`);

    try {
      await bot.sendMessage(
        targetUserId,
        "🎁 Тебе выдана бесплатная подписка CortexAI!\n\n✅ Безлимитные задачи\n✅ AI агент"
      );
    } catch (err) {
      console.log("Не удалось отправить сообщение пользователю:", err.message);
    }
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

// /revoke
bot.onText(/\/revoke (.+)/, async (msg, match) => {
  const senderId = String(msg.chat.id);

  if (!isAdmin(senderId)) {
    bot.sendMessage(msg.chat.id, "❌ У тебя нет прав для этой команды.");
    return;
  }

  const targetUserId = match[1].trim();

  try {
    await setDoc(doc(db, "subscriptions", String(targetUserId)), {
      userId: String(targetUserId),
      isActive: false,
      updatedAt: Timestamp.fromDate(new Date())
    });

    bot.sendMessage(msg.chat.id, `✅ Подписка отключена у пользователя ${targetUserId}`);
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

// /subscribe
bot.onText(/\/subscribe/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(chatId);

  if (isAdmin(userId)) {
    bot.sendMessage(chatId, "👑 Ты администратор — подписка для тебя бесплатна.");
    return;
  }

  try {
    await bot.sendInvoice(
      chatId,
      "Подписка CortexAI 🚀",
      "Безлимитные задачи + AI агент на 30 дней",
      `sub_${chatId}`,
      "",
      "XTR",
      [{ label: "Подписка на 30 дней", amount: 100 }]
    );
  } catch (err) {
    console.log("Ошибка отправки инвойса:", err.message);
    bot.sendMessage(chatId, "Ошибка при создании счёта. Попробуй позже.");
  }
});

// Подтверждение оплаты
bot.on("pre_checkout_query", (query) => {
  bot.answerPreCheckoutQuery(query.id, true);
});

// Успешная оплата
bot.on("successful_payment", async (msg) => {
  const userId = String(msg.chat.id);

  try {
    await grantSubscription(userId, 30, false);
    console.log(`Подписка активирована для ${userId}`);

    bot.sendMessage(
      msg.chat.id,
      "✅ Подписка активирована!\n\n🚀 Теперь тебе доступны:\n• Безлимитные задачи\n• AI агент\n\nПодписка действует 30 дней."
    );
  } catch (err) {
    console.log("Ошибка активации подписки:", err.message);
  }
});

// Создать повторяющуюся задачу на следующий день
async function createNextDailyTask(task) {
  try {
    const oldDate = new Date(task.reminderAt.toDate());
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
      repeat: "daily"
    });

    console.log(`Создана повторяющаяся задача для ${task.userId}: ${task.title}`);
  } catch (err) {
    console.log(`Ошибка создания повторяющейся задачи: ${err.message}`);
  }
}

// Проверка напоминаний каждую минуту
async function checkReminders() {
  try {
    const now = new Date();
    const tasksRef = collection(db, "tasks");

    const q = query(
      tasksRef,
      where("isSent", "==", false),
      where("reminderAt", "<=", Timestamp.fromDate(now))
    );

    const snapshot = await getDocs(q);

    for (const documentSnapshot of snapshot.docs) {
      const task = documentSnapshot.data();

      try {
        // Отправляем уведомление
        await bot.sendMessage(
          task.userId,
          `🔔 Напоминание!\n\n📌 ${task.title}${task.description ? `\n${task.description}` : ""}${task.repeat === "daily" ? "\n\n🔁 Ежедневная задача" : ""}`
        );

        // Отмечаем как отправленное
        await updateDoc(doc(db, "tasks", documentSnapshot.id), {
          isSent: true
        });

        console.log(`Уведомление отправлено пользователю ${task.userId}`);

        // Если задача ежедневная — создаём новую на завтра
        if (task.repeat === "daily") {
          await createNextDailyTask(task);
        }

      } catch (err) {
        console.log(`Ошибка отправки: ${err.message}`);
      }
    }
  } catch (err) {
    console.log(`Ошибка проверки: ${err.message}`);
  }
}

setInterval(checkReminders, 60000);
