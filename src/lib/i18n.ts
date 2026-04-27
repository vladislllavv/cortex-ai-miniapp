import { create } from "zustand";

export type Language = "en" | "ru";

type Dictionary = Record<string, string>;

const dict: Record<Language, Dictionary> = {
  en: {
    navHome: "Home",
    navCalendar: "Calendar",
    navAi: "AI",
    navSettings: "Settings",
    welcomeBack: "Welcome back",
    cortexUser: "Cortex User",
    dailyBriefing: "Daily Briefing",
    tasksForToday: "You have {count} tasks for today.",
    startWith: "Start with",
    mostImportantPendingTask: "your most important pending task",
    today: "Today",
    tomorrow: "Tomorrow",
    noTasksToday: "No tasks for today.",
    noTasksTomorrow: "No tasks for tomorrow.",
    noDate: "No date",
    calendarTitle: "Calendar",
    all: "All",
    noTasksOnDate: "No tasks on selected date.",
    aiProcessing: "AI Processing",
    aiHelpText: "Paste forwarded text or voice transcript. We will simulate AI extraction.",
    aiPlaceholder: "Example: Submit Q2 report by 2026-04-27 and update roadmap tomorrow.",
    analyzing: "Analyzing...",
    analyzeWithAi: "Analyze with AI",
    taskExtracted: 'Task extracted: "{title}"{date}',
    couldNotExtract: "Could not extract task from input.",
    settingsTitle: "Settings",
    preferences: "Preferences",
    settingsDesc: "Theme follows Telegram variables. Notifications and account sync can be added in next iterations.",
    aboutCortex: "About Cortex AI",
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
