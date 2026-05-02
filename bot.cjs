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
  deleteDoc,
} = require('firebase/firestore');

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
    notified3days: false,
    notified1day: false,
  });
}

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

bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `Твой Telegram ID: \`${msg.chat.id}\``,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/appss_verify/, (msg) => {
  bot.sendMessage(msg.chat.id, "appss_73be81");
});

bot.onText(/\/gift (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав.");
    return;
  }
  const targetId = match[1].trim();
  try {
    await grantSubscription(targetId, 3650, true);
    bot.sendMessage(msg.chat.id, `✅ Подписка выдана пользователю ${targetId}`);
    try {
      bot.sendMessage(targetId,
        "🎁 Тебе выдана бесплатная подписка CortexAI!\n\n" +
        "✅ Безлимитные задачи\n✅ AI ассистент без лимитов"
      );
    } catch {}
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

bot.onText(/\/revoke (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав.");
    return;
  }
  const targetId = match[1].trim();
  try {
    await setDoc(doc(db, "subscriptions", String(targetId)), {
      userId: String(targetId),
      isActive: false,
      updatedAt: Timestamp.fromDate(new Date()),
    });
    bot.sendMessage(msg.chat.id, `✅ Подписка отключена у ${targetId}`);
    try {
      bot.sendMessage(targetId, "❌ Твоя подписка CortexAI была отключена.\n\nНапиши /subscribe для оформления.");
    } catch {}
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

bot.onText(/\/subscribers/, async (msg) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав.");
    return;
  }
  try {
    const subsSnap = await getDocs(collection(db, "subscriptions"));
    const now = new Date();
    const activeList = [];
    const expiredList = [];

    subsSnap.forEach((subDoc) => {
      const sub = subDoc.data();
      if (!sub.expiresAt) return;
      const expiresAt = sub.expiresAt.toDate();
      const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
      if (sub.isActive && daysLeft > 0) {
        activeList.push({ userId: sub.userId, daysLeft, isGift: sub.isGift || false, expiresAt: expiresAt.toLocaleDateString("ru-RU") });
      } else {
        expiredList.push({ userId: sub.userId, expiresAt: expiresAt.toLocaleDateString("ru-RU") });
      }
    });

    let response = `📊 Статистика подписок:\n\n✅ Активных: ${activeList.length}\n❌ Истёкших: ${expiredList.length}\n\n`;

    if (activeList.length > 0) {
      response += `━━━ АКТИВНЫЕ ━━━\n`;
      activeList.forEach((s) => {
        response += `👤 ${s.userId}\n   📅 До: ${s.expiresAt} (${s.daysLeft} дн.)\n   ${s.isGift ? "🎁 Подарочная" : "💳 Платная"}\n\n`;
      });
    }

    if (expiredList.length > 0) {
      response += `━━━ ИСТЁКШИЕ (последние 10) ━━━\n`;
      expiredList.slice(0, 10).forEach((s) => {
        response += `👤 ${s.userId} — ${s.expiresAt}\n`;
      });
    }

    if (activeList.length === 0 && expiredList.length === 0) {
      response += "Подписчиков пока нет.";
    }

    bot.sendMessage(msg.chat.id, response);
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

bot.onText(/\/stats/, async (msg) => {
  if (!isAdmin(String(msg.chat.id))) {
    bot.sendMessage(msg.chat.id, "❌ Нет прав.");
    return;
  }
  try {
    const subsSnap = await getDocs(collection(db, "subscriptions"));
    const usersSnap = await getDocs(collection(db, "users"));
    const now = new Date();
    let activeSubs = 0, totalSubs = 0, giftSubs = 0, paidSubs = 0, totalTasks = 0;

    subsSnap.forEach((subDoc) => {
      const sub = subDoc.data();
      totalSubs++;
      if (sub.isActive && sub.expiresAt) {
        const daysLeft = Math.ceil((sub.expiresAt.toDate() - now) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0) {
          activeSubs++;
          if (sub.isGift) giftSubs++;
          else paidSubs++;
        }
      }
    });

    for (const userDoc of usersSnap.docs) {
      const tasksSnap = await getDocs(collection(db, "users", userDoc.id, "tasks"));
      totalTasks += tasksSnap.size;
    }

    bot.sendMessage(msg.chat.id,
      `📈 Статистика CortexAI:\n\n` +
      `👥 Всего пользователей: ${totalSubs}\n` +
      `✅ Активных подписок: ${activeSubs}\n` +
      `   🎁 Подарочных: ${giftSubs}\n` +
      `   💳 Платных: ${paidSubs}\n\n` +
      `📋 Всего задач в системе: ${totalTasks}\n`
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
  }
});

bot.onText(/\/help/, (msg) => {
  if (!isAdmin(String(msg.chat.id))) return;
  bot.sendMessage(msg.chat.id,
    `🛠 Команды администратора:\n\n` +
    `/gift [ID] — выдать подписку\n` +
    `/revoke [ID] — отозвать подписку\n` +
    `/subscribers — список подписчиков\n` +
    `/stats — статистика приложения\n` +
    `/myid — узнать свой ID\n\n` +
    `Команды для пользователей:\n` +
    `/start — запустить бота\n` +
    `/subscribe — купить подписку\n` +
    `/myid — узнать свой ID`
  );
});

bot.onText(/\/subscribe/, async (msg) => {
  const chatId = msg.chat.id;
  if (isAdmin(String(chatId))) {
    bot.sendMessage(chatId, "👑 Ты администратор — подписка бесплатна.");
    return;
  }
  try {
    await bot.sendInvoice(
      chatId,
      "Подписка CortexAI 🚀",
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
      "✅ Подписка активирована!\n\n" +
      "🚀 Доступны:\n• Безлимитные задачи\n• AI ассистент без лимитов\n\n" +
      "Подписка действует 30 дней."
    );
  } catch (err) {
    console.log("Ошибка активации подписки:", err.message);
  }
});

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
        if (task.status === "done") {
          await updateDoc(doc(db, "tasks", documentSnapshot.id), { isSent: true });
          continue;
        }

        await bot.sendMessage(
          task.userId,
          `🔔 Напоминание!\n\n📌 ${task.title}${task.description ? `\n${task.description}` : ""}${task.repeat === "daily" ? "\n\n🔁 Ежедневная задача" : ""}`
        );

        await updateDoc(doc(db, "tasks", documentSnapshot.id), { isSent: true });

        if (task.repeat === "daily" && task.status !== "done") {
          await createNextDailyTask(task);
        }

        console.log(`✅ Уведомление: ${task.userId} — ${task.title}`);
      } catch (err) {
        console.log(`❌ Ошибка отправки: ${err.message}`);
        try {
          await updateDoc(doc(db, "tasks", documentSnapshot.id), { isSent: true });
        } catch {}
      }
    }
  } catch (err) {
    console.log(`Ошибка проверки напоминаний: ${err.message}`);
  }
}

async function createNextDailyTask(task) {
  try {
    const oldDate = task.reminderAt.toDate();
    const nextDate = new Date(oldDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split("T")[0];

    const existingQuery = query(
      collection(db, "tasks"),
      where("userId", "==", task.userId),
      where("title", "==", task.title),
      where("repeat", "==", "daily"),
      where("isSent", "==", false)
    );
    const existing = await getDocs(existingQuery);

    let alreadyExists = false;
    existing.forEach((d) => {
      const data = d.data();
      if (data.dueDate && data.dueDate.startsWith(nextDateStr)) {
        alreadyExists = true;
      }
    });

    if (alreadyExists) return;

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

    console.log(`🔁 Создана повторяющаяся задача: ${task.title} на ${nextDateStr}`);
  } catch (err) {
    console.log(`Ошибка создания повторяющейся задачи: ${err.message}`);
  }
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
        try {
          await bot.sendMessage(sub.userId,
            `⚠️ Подписка CortexAI заканчивается через 3 дня!\n\n` +
            `📅 Дата окончания: ${expiresAt.toLocaleDateString("ru-RU")}\n\n` +
            `Напиши /subscribe для продления 🚀`
          );
          await updateDoc(doc(db, "subscriptions", subDoc.id), { notified3days: true });
        } catch {}
      }

      if (daysLeft === 1 && !sub.notified1day) {
        try {
          await bot.sendMessage(sub.userId,
            `🚨 Подписка CortexAI заканчивается ЗАВТРА!\n\nНапиши /subscribe для продления ⚡`
          );
          await updateDoc(doc(db, "subscriptions", subDoc.id), { notified1day: true });
        } catch {}
      }

      if (daysLeft <= 0 && sub.isActive) {
        try {
          await updateDoc(doc(db, "subscriptions", subDoc.id), { isActive: false });
          await bot.sendMessage(sub.userId, `❌ Подписка CortexAI истекла.\n\nНапиши /subscribe для продления.`);
        } catch {}
      }
    }
  } catch (err) {
    console.log("Ошибка проверки подписок:", err.message);
  }
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
        if (bd.date === tomorrowStr) {
          try {
            await bot.sendMessage(userId, `🎂 Завтра день рождения у ${bd.name}!\n\nНе забудь поздравить! 🎉`);
          } catch {}
        }
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

async function sendEveningMotivation() {
  try {
    const now = new Date();
    if (now.getHours() !== 21) return;

    const todayStr = now.toISOString().split("T")[0];

    const motivations = [
      "🌟 Каждый шаг вперёд — это победа. Отдохни и завтра снова в бой!",
      "💪 Ты делаешь больше, чем думаешь. Гордись собой!",
      "🌙 Хороший вечер — залог продуктивного утра. Отдыхай!",
      "🎯 Фокус сегодня — результат завтра. Молодец!",
      "✨ Маленькие победы складываются в большие достижения!",
      "🌈 Каждый выполненный пункт — это шаг к мечте!",
      "🏆 Ты справился! Вечер для отдыха и восстановления.",
      "🌿 Отдых — это тоже часть продуктивности. Расслабься!",
      "⭐ Сегодня ты был лучше вчерашнего себя. Это и есть прогресс!",
      "🎵 Хороший вечер — это заслуженная награда за труд!",
    ];

    const usersSnap = await getDocs(collection(db, "users"));

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      try {
        const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
        let doneToday = 0;
        tasksSnap.forEach((d) => {
          const data = d.data();
          if (data.status === "done" && data.completedAt && data.completedAt.startsWith(todayStr)) {
            doneToday++;
          }
        });

        if (doneToday > 0) {
          const motivation = motivations[Math.floor(Math.random() * motivations.length)];
          const taskWord = doneToday === 1 ? "задачу" : doneToday < 5 ? "задачи" : "задач";
          await bot.sendMessage(
            userId,
            `🌙 Добрый вечер!\n\nСегодня вы выполнили ${doneToday} ${taskWord}! 🎉\n\n${motivation}`
          );
        }
      } catch {}
    }
  } catch (err) {
    console.log("Ошибка вечерней мотивации:", err.message);
  }
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
          if (data.status === "done" && data.completedAt) {
            const completedAt = new Date(data.completedAt);
            if (completedAt < yesterday) {
              try {
                await deleteDoc(doc(db, "users", userId, "tasks", taskDoc.id));
                console.log(`🗑 Удалена старая задача: ${data.title}`);
              } catch {}
            }
          }
        }
      } catch {}
    }

    console.log("✅ Очистка старых задач завершена");
  } catch (err) {
    console.log("Ошибка очистки задач:", err.message);
  }
}

setInterval(checkReminders, 60 * 1000);
setInterval(checkSubscriptions, 60 * 60 * 1000);
setInterval(checkBirthdays, 60 * 60 * 1000);
setInterval(sendEveningMotivation, 60 * 1000);
setInterval(cleanupOldDoneTasks, 6 * 60 * 60 * 1000);
