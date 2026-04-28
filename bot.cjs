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

console.log("Бот запущен ✅");

// Команда /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Привет! Я буду напоминать тебе о задачах 🔔");
});

// Верификация appss
bot.onText(/\/appss_verify/, (msg) => {
  bot.sendMessage(msg.chat.id, "appss_73be81");
});

// Команда /subscribe — отправляем инвойс для оплаты
bot.onText(/\/subscribe/, async (msg) => {
  const chatId = msg.chat.id;

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
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await setDoc(doc(db, "subscriptions", userId), {
      userId: userId,
      isActive: true,
      expiresAt: Timestamp.fromDate(expiresAt),
      updatedAt: Timestamp.fromDate(new Date())
    });

    console.log(`Подписка активирована для ${userId}`);

    bot.sendMessage(
      msg.chat.id,
      "✅ Подписка активирована!\n\n🚀 Теперь тебе доступны:\n• Безлимитные задачи\n• AI агент\n\nПодписка действует 30 дней."
    );
  } catch (err) {
    console.log("Ошибка активации подписки:", err.message);
  }
});

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

    snapshot.forEach(async (document) => {
      const task = document.data();
      try {
        await bot.sendMessage(
          task.userId,
          `🔔 Напоминание!\n\n📌 ${task.title}\n${task.description ? task.description : ""}`
        );
        await updateDoc(doc(db, "tasks", document.id), {
          isSent: true
        });
        console.log(`Уведомление отправлено пользователю ${task.userId}`);
      } catch (err) {
        console.log(`Ошибка отправки: ${err.message}`);
      }
    });
  } catch (err) {
    console.log(`Ошибка проверки: ${err.message}`);
  }
}

setInterval(checkReminders, 60000);
