const TelegramBot = require('node-telegram-bot-api');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, updateDoc, doc, Timestamp } = require('firebase/firestore');

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

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Привет! Я буду напоминать тебе о задачах 🔔");
});

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
