const TelegramBot = require('node-telegram-bot-api');
const token = process.env.BOT_TOKEN; // Токен возьмем из настроек Amvera
const bot = new TelegramBot(token, {polling: true});

// Бот отвечает на команду /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Привет! Я буду присылать тебе уведомления из планировщика.");
});

// Функция проверки уведомлений (упрощенно)
setInterval(() => {
    console.log("Проверка задач в базе...");
    // ТУТ ДОЛЖЕН БЫТЬ ТВОЙ ЗАПРОС К БАЗЕ ДАННЫХ
    // Если время пришло:
    // bot.sendMessage(user_id, "Пора делать задачу: " + task_text);
}, 60000); // Проверка каждую минуту

console.log("Бот запущен...");
