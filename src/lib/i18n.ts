import { create } from "zustand";

type Language = "ru" | "en";

const translations: Record<string, Record<Language, string>> = {
  // Навигация
  today:    { ru: "Сегодня",   en: "Today"    },
  plan:     { ru: "План",      en: "Plan"     },
  ai:       { ru: "AI",        en: "AI"       },
  more:     { ru: "Ещё",       en: "More"     },

  // AI Hub сегменты
  assistant: { ru: "Ассистент", en: "Assistant" },
  coach:     { ru: "Коуч",      en: "Coach"     },

  // Workspace
  personal:         { ru: "Личное",           en: "Personal"          },
  team:             { ru: "Команда",          en: "Team"              },
  workspace:        { ru: "Пространство",     en: "Workspace"         },
  workspaces:       { ru: "Пространства",     en: "Workspaces"        },
  allTasks:         { ru: "Все",              en: "All"               },
  myTasks:          { ru: "Мои",             en: "Mine"              },
  createWorkspace:  { ru: "Создать команду",  en: "Create team"       },
  switchWorkspace:  { ru: "Переключить",      en: "Switch"            },

  // Задачи
  low:      { ru: "Низкий",    en: "Low"      },
  medium:   { ru: "Средний",   en: "Medium"   },
  high:     { ru: "Высокий",   en: "High"     },

  // Роли
  owner:    { ru: "Владелец",  en: "Owner"    },
  admin:    { ru: "Админ",     en: "Admin"    },
  member:   { ru: "Участник",  en: "Member"   },

  // Общее
  save:     { ru: "Сохранить", en: "Save"     },
  cancel:   { ru: "Отмена",    en: "Cancel"   },
  delete:   { ru: "Удалить",   en: "Delete"   },
  edit:     { ru: "Изменить",  en: "Edit"     },
  add:      { ru: "Добавить",  en: "Add"      },
  back:     { ru: "Назад",     en: "Back"     },
  settings: { ru: "Настройки", en: "Settings" },
  loading:  { ru: "Загрузка...", en: "Loading..." },
};

export function t(language: Language, key: string): string {
  return translations[key]?.[language] ?? key;
}

interface I18nStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useI18nStore = create<I18nStore>((set) => ({
  language: (localStorage.getItem("cortex-lang") as Language) || "ru",
  setLanguage: (lang) => {
    localStorage.setItem("cortex-lang", lang);
    set({ language: lang });
  },
}));

export function initLanguageFromStorage() {
  const lang = localStorage.getItem("cortex-lang") as Language;
  if (lang) {
    useI18nStore.setState({ language: lang });
  }
}
