// Форматирование даты
export function formatDateTime(isoString: string, language: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(now.getDate() + 1);

    const timeStr = date.toLocaleTimeString(
      language === "ru" ? "ru-RU" : "en-US",
      { hour: "2-digit", minute: "2-digit" }
    );

    if (date.toDateString() === now.toDateString()) {
      return language === "ru" ? `Сегодня ${timeStr}` : `Today ${timeStr}`;
    }
    if (date.toDateString() === tomorrowDate.toDateString()) {
      return language === "ru" ? `Завтра ${timeStr}` : `Tomorrow ${timeStr}`;
    }

    const dayStr = date.toLocaleDateString(
      language === "ru" ? "ru-RU" : "en-US",
      { day: "numeric", month: "short" }
    );
    return `${dayStr} ${timeStr}`;
  } catch { return ""; }
}

// Проверка что дата сегодня
export function isToday(isoString: string): boolean {
  try {
    const date = new Date(isoString);
    return date.toDateString() === new Date().toDateString();
  } catch { return false; }
}

// Проверка что дата завтра
export function isTomorrow(isoString: string): boolean {
  try {
    const date = new Date(isoString);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  } catch { return false; }
}

// Дней до даты
export function daysUntil(isoString: string): number {
  try {
    const date = new Date(isoString);
    const now = new Date();
    return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  } catch { return 0; }
}

// Цвет приоритета
export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "high": return "#ef4444";
    case "medium": return "#f59e0b";
    case "low": return "#22c55e";
    default: return "#94a3b8";
  }
}

// Склонение слов (русский)
export function plural(
  count: number,
  one: string,
  few: string,
  many: string
): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

// Дебаунс
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Генерация случайного элемента массива
export function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Форматирование числа задач
export function formatTaskCount(count: number, language: string): string {
  if (language === "ru") {
    return `${count} ${plural(count, "задача", "задачи", "задач")}`;
  }
  return `${count} ${count === 1 ? "task" : "tasks"}`;
}

// Цвет для даты (просрочена, сегодня, скоро)
export function getDateColor(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (diff < 0) return "#ef4444"; // просрочена
    if (hours < 2) return "#f59e0b"; // меньше 2 часов
    if (isToday(isoString)) return "#60a5fa"; // сегодня
    return "rgba(255,255,255,0.4)"; // обычный
  } catch { return "rgba(255,255,255,0.4)"; }
}

// Безопасный JSON parse
export function safeJsonParse<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

// Проверка онлайн статуса
export function isOnline(): boolean {
  return navigator.onLine;
}
