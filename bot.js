import TelegramBot from 'node-telegram-bot-api';

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

console.log("Бот запущен ✅");

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Бот работает ✅");
});
