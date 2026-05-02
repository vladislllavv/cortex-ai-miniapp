import { create } from "zustand";

const translations = {
  ru: {
    home: "Главная",
    calendar: "Календарь",
    settings: "Настройки",
    createTask: "Новая задача",
    taskTitle: "Название",
    taskTitlePlaceholder: "Что нужно сделать?",
    saveTask: "Создать",
    cancel: "Отмена",
    low: "Низкий",
    medium: "Средний",
    high: "Высокий",
    urgency: "Приоритет",
    reminderDate: "Дата",
    reminderTime: "Время",
    today: "Сегодня",
    tomorrow: "Завтра",
    later: "Позже",
    dailyBriefing: "Ежедневный брифинг",
    tasksForToday: "{count} задач",
    noTasksToday: "Нет задач на сегодня",
    noTasksTomorrow: "Нет задач на завтра",
    startWith: "Начни с",
    welcomeTitle: "Добро пожаловать в CortexAI!",
    welcomeDescription: "Умный планировщик задач с AI ассистентом",
    welcomeStart: "Начать",
    completed: "Выполненные",
    active: "Активные",
    shoppingList: "Список покупок",
    addItem: "Добавить товар",
    dailyNoDate: "Ежедневные (без даты)",
    dailyNoDateHint: "Эти задачи повторяются каждый день без конкретного времени. Удали ненужные или добавь дату.",
    sections: "Разделы",
    noDataInSection: "Нет данных. Добавь в Календаре.",
    addSection: "Добавить раздел",
    syncing: "Синхронизация...",
    allDone: "Все задачи выполнены! 🎉",
    noTasksForToday: "На сегодня задач нет",
    forToday: "на сегодня",
    deleteAll: "Удалить все задачи",
    dangerZone: "Опасная зона",
    subscription: "Подписка",
    subscriptionActive: "Подписка активна",
    noSubscription: "Нет подписки",
    subscribe: "Оформить за 100 Stars/мес",
    renew: "Продлить подписку",
    language: "Язык",
    account: "Аккаунт",
    notifications: "Уведомления",
    statistics: "Статистика",
    total: "Всего",
    done: "Выполнено",
    mySections: "Мои разделы",
    newSection: "Новый раздел",
    editSection: "Изменить раздел",
    sectionName: "Название раздела",
    icon: "Иконка",
    color: "Цвет",
    save: "Сохранить",
    create: "Создать",
    birthdayToday: "День рождения сегодня!",
    birthdayTomorrow: "День рождения завтра",
    reschedule: "Перенести",
    rescheduleTo: "Перенести на:",
    daily: "Каждый день",
    dailyTask: "ежедневно",
    bought: "куплено",
    whatCreate: "Что создаём?",
    task: "Задача",
    shopping: "Покупки",
    whatBuy: "Что купить?",
    addProduct: "Добавить товар",
    whenRemind: "Когда напомнить?",
    date: "Дата",
    time: "Время",
    next: "Далее",
    back: "Назад",
    saving: "Сохраняю...",
    step: "Шаг",
    of: "из",
    priority: "Приоритет",
  },
  en: {
    home: "Home",
    calendar: "Calendar",
    settings: "Settings",
    createTask: "New task",
    taskTitle: "Title",
    taskTitlePlaceholder: "What to do?",
    saveTask: "Create",
    cancel: "Cancel",
    low: "Low",
    medium: "Medium",
    high: "High",
    urgency: "Priority",
    reminderDate: "Date",
    reminderTime: "Time",
    today: "Today",
    tomorrow: "Tomorrow",
    later: "Later",
    dailyBriefing: "Daily briefing",
    tasksForToday: "{count} tasks",
    noTasksToday: "No tasks today",
    noTasksTomorrow: "No tasks tomorrow",
    startWith: "Start with",
    welcomeTitle: "Welcome to CortexAI!",
    welcomeDescription: "Smart task planner with AI assistant",
    welcomeStart: "Get started",
    completed: "Completed",
    active: "Active",
    shoppingList: "Shopping list",
    addItem: "Add item",
    dailyNoDate: "Daily (no date)",
    dailyNoDateHint: "These tasks repeat daily without a specific time. Delete unnecessary ones or add a date.",
    sections: "Sections",
    noDataInSection: "No data. Add in Calendar.",
    addSection: "Add section",
    syncing: "Syncing...",
    allDone: "All tasks done! 🎉",
    noTasksForToday: "No tasks for today",
    forToday: "for today",
    deleteAll: "Delete all tasks",
    dangerZone: "Danger zone",
    subscription: "Subscription",
    subscriptionActive: "Subscription active",
    noSubscription: "No subscription",
    subscribe: "Subscribe for 100 Stars/mo",
    renew: "Renew subscription",
    language: "Language",
    account: "Account",
    notifications: "Notifications",
    statistics: "Statistics",
    total: "Total",
    done: "Done",
    mySections: "My sections",
    newSection: "New section",
    editSection: "Edit section",
    sectionName: "Section name",
    icon: "Icon",
    color: "Color",
    save: "Save",
    create: "Create",
    birthdayToday: "Birthday today!",
    birthdayTomorrow: "Birthday tomorrow",
    reschedule: "Reschedule",
    rescheduleTo: "Reschedule to:",
    daily: "Every day",
    dailyTask: "daily",
    bought: "bought",
    whatCreate: "What to create?",
    task: "Task",
    shopping: "Shopping",
    whatBuy: "What to buy?",
    addProduct: "Add item",
    whenRemind: "When to remind?",
    date: "Date",
    time: "Time",
    next: "Next",
    back: "Back",
    saving: "Saving...",
    step: "Step",
    of: "of",
    priority: "Priority",
  },
} as const;

type Lang = "ru" | "en";
type Key = keyof typeof translations.ru;

export function t(lang: Lang, key: Key): string {
  return (translations[lang] as any)?.[key]
    ?? (translations.ru as any)?.[key]
    ?? key;
}

type I18nStore = {
  language: Lang;
  setLanguage: (lang: Lang) => void;
};

export const useI18nStore = create<I18nStore>((set) => ({
  language: (localStorage.getItem("cortex-lang") as Lang) || "ru",
  setLanguage: (lang) => {
    localStorage.setItem("cortex-lang", lang);
    set({ language: lang });
  },
}));    aboutCortex: "About Cortex AI",
    aboutDesc: "MVP build for smart task capture, daily briefing, and quick timeline filtering.",
    language: "Language",
    welcomeTitle: "Welcome to Cortex AI",
    welcomeDescription: "Use + to create tasks, set reminder date/time, and choose urgency. Open AI to extract tasks from long messages.",
    welcomeStart: "Got it",
    createTask: "Create task",
    taskTitle: "Task title",
    taskTitlePlaceholder: "What needs to be done?",
    reminderDate: "Reminder date",
    reminderTime: "Reminder time",
    urgency: "Urgency",
    low: "Low",
    medium: "Medium",
    high: "High",
    cancel: "Cancel",
    saveTask: "Save task",
    editTask: "Edit task",
    saveChanges: "Save changes",
  },
  ru: {
    navHome: "Главная",
    navCalendar: "Календарь",
    navAi: "ИИ",
    navSettings: "Настройки",
    welcomeBack: "С возвращением",
    cortexUser: "Пользователь Cortex",
    dailyBriefing: "Ежедневный брифинг",
    tasksForToday: "У вас {count} задач на сегодня.",
    startWith: "Начните с",
    mostImportantPendingTask: "самой важной незавершенной задачи",
    today: "Сегодня",
    tomorrow: "Завтра",
    noTasksToday: "На сегодня задач нет.",
    noTasksTomorrow: "На завтра задач нет.",
    noDate: "Без даты",
    calendarTitle: "Календарь",
    all: "Все",
    noTasksOnDate: "На выбранную дату задач нет.",
    aiProcessing: "Обработка ИИ",
    aiHelpText: "Вставьте пересланный текст или расшифровку голосового сообщения. Мы имитируем анализ ИИ.",
    aiPlaceholder: "Пример: Сдать отчет Q2 до 2026-04-27 и обновить роадмап завтра.",
    analyzing: "Анализируем...",
    analyzeWithAi: "Анализировать с ИИ",
    taskExtracted: 'Извлечена задача: "{title}"{date}',
    couldNotExtract: "Не удалось извлечь задачу из текста.",
    settingsTitle: "Настройки",
    preferences: "Предпочтения",
    settingsDesc: "Тема использует переменные Telegram. Уведомления и синхронизацию аккаунта можно добавить в следующих итерациях.",
    aboutCortex: "О Cortex AI",
    aboutDesc: "MVP для умного захвата задач, ежедневного брифинга и быстрого фильтра по датам.",
    language: "Язык",
    welcomeTitle: "Добро пожаловать в Cortex AI",
    welcomeDescription: "Используйте +, чтобы создавать задачи, задавать дату/время напоминания и выбирать срочность. Откройте ИИ для извлечения задач из длинных сообщений.",
    welcomeStart: "Понятно",
    createTask: "Создать задачу",
    taskTitle: "Название задачи",
    taskTitlePlaceholder: "Что нужно сделать?",
    reminderDate: "Дата напоминания",
    reminderTime: "Время напоминания",
    urgency: "Срочность",
    low: "Низкая",
    medium: "Средняя",
    high: "Высокая",
    cancel: "Отмена",
    saveTask: "Сохранить задачу",
    editTask: "Редактировать задачу",
    saveChanges: "Сохранить изменения",
  },
};

type I18nStore = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
};

export const useI18nStore = create<I18nStore>((set) => ({
  language: "ru",
  setLanguage: (language) => {
    if (typeof window !== "undefined") window.localStorage.setItem("cortex-lang", language);
    set({ language });
  },
  toggleLanguage: () =>
    set((state) => {
      const next = state.language === "en" ? "ru" : "en";
      if (typeof window !== "undefined") window.localStorage.setItem("cortex-lang", next);
      return { language: next };
    }),
}));

export function initLanguageFromStorage() {
  if (typeof window === "undefined") return;
  const saved = window.localStorage.getItem("cortex-lang");
  if (saved === "en" || saved === "ru") {
    useI18nStore.getState().setLanguage(saved);
  } else {
    useI18nStore.getState().setLanguage("ru");
  }
}

export function t(language: Language, key: string): string {
  return dict[language]?.[key] ?? dict.en[key] ?? key;
}
