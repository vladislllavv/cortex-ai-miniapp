import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Language = "en" | "ru";

export function formatTaskDay(date: Date | null, language: Language) {
  if (!date) return language === "ru" ? "Без даты" : "No date";
  const target = new Date(date);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (target.toDateString() === today.toDateString()) return language === "ru" ? "Сегодня" : "Today";
  if (target.toDateString() === tomorrow.toDateString()) return language === "ru" ? "Завтра" : "Tomorrow";

  return target.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", {
    month: "short",
    day: "numeric",
  });
}
