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
  onSnapshot,
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
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const bot = new TelegramBot(token, { polling: true });

const ADMINS = ["56733076"];
const sentNotifications = new Set();

bot.setMyCommands([
  { command: "start", description: "Запустить бота" },
  { command: "subscribe", description: "Купить подписку" },
  { command: "myid", description: "Узнать свой ID" },
]);

console.log("Бот запущен ✅");
console.log("Groq AI:", GROQ_API_KEY ? "подключён ✅" : "ключ не найден ❌");

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

// ============ GROQ AI — БЫСТРАЯ МОДЕЛЬ ============

async function askGroq(messages, systemPrompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 400,
      temperature: 0.6,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Нет ответа";
}

// ============ AI СЛУШАТЕЛЬ ============

function startAiListener() {
  console.log("AI слушатель запущен ✅");

  const q = query(
    collection(db, "ai_requests"),
    where("status", "==", "pending")
  );

  onSnapshot(q, async (snapshot) => {
    const newDocs = snapshot.docChanges().filter((c) => c.type === "added");
    if (newDocs.length === 0) return;

    for (const change of newDocs) {
      const requestDoc = change.doc;
      const request = requestDoc.data();
      const requestId = requestDoc.id;

      try {
        await updateDoc(doc(db, "ai_requests", requestId), {
          status: "processing",
          processedAt: new Date().toISOString(),
        });
      } catch {
        continue;
      }

      const { userId, message, history, language, tasks } = request;
      console.log(`⚡ AI запрос от ${userId}: ${(message || "").slice(0, 50)}`);

      const ru = language === "ru";
      const now = new Date();

      const systemPrompt = `Ты AI ассистент планировщика CortexAI. Время: ${now.toLocaleString("ru-RU")}.

Задачи пользователя: ${tasks && tasks.length > 0
  ? tasks.map(t => `${t.title}${t.dueDate ? ` (${new Date(t.dueDate).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })})` : ""}`).join(", ")
  : "нет задач"}

Если пользователь хочет создать задачу или напоминание — добавь в конец ответа:
TASK_JSON:{"title":"название","dueDate":"ISO_дата_или_null","priority":"medium","repeat":"none"}

Правила:
- Отвечай коротко (2-3 предложения максимум)
- ${ru ? "Только на русском языке" : "Only in English"}
- Используй эмодзи
- priority: low, medium или high
- repeat: none или daily
- Если пользователь не указал время — спроси когда напомнить
- dueDate должна быть валидной ISO строкой или null`;

      try {
        const recentHistory = (history || []).slice(-6);
        const startTime = Date.now();

        const aiResponse = await askGroq(recentHistory, systemPrompt);
        console.log(`⏱ Groq ответил за ${Date.now() - startTime}ms`);

        let taskCreated = null;
        const taskJsonMatch = aiResponse.match(/TASK_JSON:(\{[^}]+\})/);

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
                dueDate: taskData.dueDate || null,
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
                reminderAt: taskData.dueDate ? Timestamp.fromDate(new Date(taskData.dueDate)) : null,
              };

              const saves = [
                setDoc(doc(db, "users", userId, "tasks", taskId), taskForSync),
              ];

              if (taskData.dueDate) {
                const dueDate = new Date(taskData.dueDate);
                if (!isNaN(dueDate.getTime())) {
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
                priority: taskData.priority || "medium",
              };

              console.log(`✅ Задача создана AI: ${taskData.title}`);
            }
          } catch (parseErr) {
            console.log("Ошибка парсинга задачи:", parseErr.message);
          }
        }

        const cleanResponse = aiResponse.replace(/TASK_JSON:\{[^}]+\}/, "").trim();

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

        console.log(`✅ AI ответил пользователю ${userId}`);
      } catch (err) {
        console.log(`❌ Ошибка AI: ${err.message}`);

        const ru = language === "ru";
        await Promise.all([
          setDoc(doc(db, "ai_responses", requestId), {
            userId,
            requestId,
            message: ru
              ? "⚠️ Произошла ошибка. Попробуй ещё раз."
              : "⚠️ An error occurred. Please try again.",
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
  }, (error) => {
    console.log("Ошибка слушателя AI:", error.message);
    setTimeout(startAiListener, 3000);
  });
}

// ============ КОМАНДЫ БОТА ============

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
  bot.sendMessage(msg.chat.id, `Твой Telegram ID: \`${msg.chat.id}\``, { parse_mode: "Markdown" });
});

bot.onText(/\/appss_verify/, (msg) => {
  bot.sendMessage(msg.chat.id, "appss_73be81");
});

bot.onText(/\/gift (.+)/, async (msg, match) => {
  if (!isAdmin(String(msg.chat.id))) { bot.sendMessage(msg.chat.id, "❌ Нет прав."); return; }
  const targetId = match[1].trim();
  try {
    await grantSubscription(targetId, 3650, true);
    bot.sendMessage(msg.chat.id, `✅ Подписка выдана пользователю ${targetId}`);
    try { bot.sendMessage(targetId, "🎁 Тебе выдана бесплатная подписка CortexAI!\n\n✅ Безлимитные задачи\n✅ AI ассистент без лимитов"); } catch {}
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
    try { bot.sendMessage(targetId, "❌ Твоя подписка CortexAI была отключена.\n\nНапиши /subscribe для оформления."); } catch {}
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
    let activeSubs = 0, totalSubs = 0, totalTasks = 0;
    subsSnap.forEach((s) => {
      totalSubs++;
      const sub = s.data();
      if (sub.isActive && sub.expiresAt && Math.ceil((sub.expiresAt.toDate() - now) / (1000 * 60 * 60 * 24)) > 0) activeSubs++;
    });
    for (const userDoc of usersSnap.docs) {
      const t = await getDocs(collection(db, "users", userDoc.id, "tasks"));
      totalTasks += t.size;
    }
    bot.sendMessage(msg.chat.id, `📈 Статистика:\n\n👥 Пользователей: ${totalSubs}\n✅ Активных подписок: ${activeSubs}\n📋 Задач: ${totalTasks}`);
  } catch (err) { bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`); }
});

bot.onText(/\/help/, (msg) => {
  if (!isAdmin(String(msg.chat.id))) return;
  bot.sendMessage(msg.chat.id,
    `🛠 Команды:\n\n/gift [ID] — выдать подписку\n/revoke [ID] — отозвать\n/subscribers — список\n/stats — статистика\n/myid — мой ID`
  );
});

bot.onText(/\/subscribe/, async (msg) => {
  const chatId = msg.chat.id;
  if (isAdmin(String(chatId))) { bot.sendMessage(chatId, "👑 Ты администратор — подписка бесплатна."); return; }
  try {
    await bot.sendInvoice(chatId, "Подписка CortexAI 🚀", "Безлимитные задачи + AI ассистент на 30 дней", `sub_${chatId}`, "", "XTR", [{ label: "Подписка на 30 дней", amount: 100 }]);
  } catch (err) { bot.sendMessage(chatId, "Ошибка при создании счёта. Попробуй позже."); }
});

bot.on("pre_checkout_query", (query) => { bot.answerPreCheckoutQuery(query.id, true); });

bot.on("successful_payment", async (msg) => {
  const userId = String(msg.chat.id);
  try {
    await grantSubscription(userId, 30, false);
    bot.sendMessage(msg.chat.id, "✅ Подписка активирована!\n\n🚀 Безлимитные задачи + AI без лимитов\n\nПодписка 30 дней.");
  } catch (err) { console.log("Ошибка активации:", err.message); }
});

// ============ ПРОВЕРКА НАПОМИНАНИЙ ============

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
      const taskId = documentSnapshot.id;
      if (sentNotifications.has(taskId)) continue;
      sentNotifications.add(taskId);

      const task = documentSnapshot.data();
      try {
        await updateDoc(doc(db, "tasks", taskId), { isSent: true });
        if (task.status === "done") continue;

        await bot.sendMessage(task.userId,
          `🔔 Напоминание!\n\n📌 ${task.title}${task.description ? `\n${task.description}` : ""}${task.repeat === "daily" ? "\n\n🔁 Ежедневная задача" : ""}`
        );

        if (task.repeat === "daily" && task.status !== "done") {
          await createNextDailyTask(task);
        }

        console.log(`✅ Уведомление: ${task.userId} — ${task.title}`);
      } catch (err) {
        console.log(`❌ Ошибка отправки: ${err.message}`);
      }
    }

    if (sentNotifications.size > 1000) sentNotifications.clear();
  } catch (err) {
    console.log(`Ошибка проверки напоминаний: ${err.message}`);
  }
}

async function createNextDailyTask(task) {
  try {
    const nextDate = new Date(task.reminderAt.toDate());
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split("T")[0];

    const existing = await getDocs(query(
      collection(db, "tasks"),
      where("userId", "==", task.userId),
      where("title", "==", task.title),
      where("repeat", "==", "daily"),
      where("isSent", "==", false)
    ));

    let exists = false;
    existing.forEach((d) => { if (d.data().dueDate?.startsWith(nextDateStr)) exists = true; });
    if (exists) return;

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
  } catch (err) { console.log(`Ошибка повторяющейся задачи: ${err.message}`); }
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
          await bot.sendMessage(sub.userId, `⚠️ Подписка заканчивается через 3 дня!\n\nНапиши /subscribe для продления 🚀`);
          await updateDoc(doc(db, "subscriptions", subDoc.id), { notified3days: true });
        } catch {}
      }
      if (daysLeft === 1 && !sub.notified1day) {
        try {
          await bot.sendMessage(sub.userId, `🚨 Подписка заканчивается ЗАВТРА!\n\nНапиши /subscribe ⚡`);
          await updateDoc(doc(db, "subscriptions", subDoc.id), { notified1day: true });
        } catch {}
      }
      if (daysLeft <= 0 && sub.isActive) {
        try {
          await updateDoc(doc(db, "subscriptions", subDoc.id), { isActive: false });
          await bot.sendMessage(sub.userId, `❌ Подписка истекла.\n\nНапиши /subscribe для продления.`);
        } catch {}
      }
    }
  } catch (err) { console.log("Ошибка проверки подписок:", err.message); }
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
        if (bd.date === tomorrowStr) { try { await bot.sendMessage(userId, `🎂 Завтра день рождения у ${bd.name}! Не забудь поздравить! 🎉`); } catch {} }
        if (bd.date === todayStr) { try { await bot.sendMessage(userId, `🎉 Сегодня день рождения у ${bd.name}! Поздравь прямо сейчас! 🎂🥳`); } catch {} }
      }
    }
  } catch (err) { console.log("Ошибка проверки дней рождения:", err.message); }
}

async function sendEveningMotivation() {
  try {
    const now = new Date();
    if (now.getHours() !== 21) return;
    const todayStr = now.toISOString().split("T")[0];
    const key = `motivation_${todayStr}`;
    if (sentNotifications.has(key)) return;
    sentNotifications.add(key);

    const motivations = [
      "🌟 Каждый шаг вперёд — это победа!",
      "💪 Ты делаешь больше, чем думаешь. Гордись собой!",
      "🌙 Хороший вечер — залог продуктивного утра!",
      "🎯 Фокус сегодня — результат завтра!",
      "✨ Маленькие победы складываются в большие достижения!",
      "⭐ Сегодня ты был лучше вчерашнего себя!",
    ];

    const usersSnap = await getDocs(collection(db, "users"));
    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      try {
        const tasksSnap = await getDocs(collection(db, "users", userId, "tasks"));
        let doneToday = 0;
        tasksSnap.forEach((d) => {
          const data = d.data();
          if (data.status === "done" && data.completedAt?.startsWith(todayStr)) doneToday++;
        });
        if (doneToday > 0) {
          const motivation = motivations[Math.floor(Math.random() * motivations.length)];
          const word = doneToday === 1 ? "задачу" : doneToday < 5 ? "задачи" : "задач";
          await bot.sendMessage(userId, `🌙 Добрый вечер!\n\nСегодня вы выполнили ${doneToday} ${word}! 🎉\n\n${motivation}`);
        }
      } catch {}
    }
  } catch (err) { console.log("Ошибка вечерней мотивации:", err.message); }
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

    // Чистим старые ai_requests/responses
    try {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const aiSnap = await getDocs(query(collection(db, "ai_requests"), where("status", "==", "done")));
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

    console.log("✅ Очистка завершена");
  } catch (err) { console.log("Ошибка очистки:", err.message); }
}

// Запускаем AI слушатель
startAiListener();

setInterval(checkReminders, 60 * 1000);
setInterval(checkSubscriptions, 60 * 60 * 1000);
setInterval(checkBirthdays, 60 * 60 * 1000);
setInterval(sendEveningMotivation, 60 * 1000);
setInterval(cleanupOldDoneTasks, 6 * 60 * 60 * 1000);
