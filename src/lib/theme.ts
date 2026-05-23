import { db } from "./firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

export interface Theme {
  id: string;
  name: string;
  nameEn: string;
  primary: string;
  primaryHover: string;
  bg: string;
  bgCard: string;
  bgNav: string;
  /** Для multicolor — массив цветов градиента */
  gradient?: string[];
  /** Описание для UI */
  desc?: string;
  descEn?: string;
}

export const THEMES: Theme[] = [
  // ── Монотонные ──────────────────────────────────────────────────────
  {
    id: "midnight",
    name: "Полночь", nameEn: "Midnight",
    desc: "Глубокий чёрный", descEn: "Deep black",
    primary: "#6366f1", primaryHover: "#4f46e5",
    bg: "#08080f", bgCard: "#12121e", bgNav: "rgba(8,8,15,0.97)",
  },
  {
    id: "dark-blue",
    name: "Синяя", nameEn: "Blue",
    desc: "Классический синий", descEn: "Classic blue",
    primary: "#3b82f6", primaryHover: "#2563eb",
    bg: "#0a0f1e", bgCard: "#111827", bgNav: "rgba(10,15,30,0.97)",
  },
  {
    id: "dark-purple",
    name: "Фиолет", nameEn: "Purple",
    desc: "Мистический", descEn: "Mysterious",
    primary: "#a855f7", primaryHover: "#9333ea",
    bg: "#0d0818", bgCard: "#160d28", bgNav: "rgba(13,8,24,0.97)",
  },
  {
    id: "dark-green",
    name: "Зелёная", nameEn: "Green",
    desc: "Природный", descEn: "Natural",
    primary: "#22c55e", primaryHover: "#16a34a",
    bg: "#061210", bgCard: "#0c1f18", bgNav: "rgba(6,18,16,0.97)",
  },
  {
    id: "dark-cyan",
    name: "Голубая", nameEn: "Cyan",
    desc: "Океан", descEn: "Ocean",
    primary: "#06b6d4", primaryHover: "#0891b2",
    bg: "#04141a", bgCard: "#071e28", bgNav: "rgba(4,20,26,0.97)",
  },
  {
    id: "dark-rose",
    name: "Розовая", nameEn: "Rose",
    desc: "Нежный", descEn: "Gentle",
    primary: "#f43f5e", primaryHover: "#e11d48",
    bg: "#150810", bgCard: "#200c18", bgNav: "rgba(21,8,16,0.97)",
  },
  {
    id: "dark-orange",
    name: "Закат", nameEn: "Sunset",
    desc: "Тёплый", descEn: "Warm",
    primary: "#f97316", primaryHover: "#ea6f0e",
    bg: "#150a04", bgCard: "#221308", bgNav: "rgba(21,10,4,0.97)",
  },
  {
    id: "dark-amber",
    name: "Золото", nameEn: "Gold",
    desc: "Премиум", descEn: "Premium",
    primary: "#f59e0b", primaryHover: "#d97706",
    bg: "#120e04", bgCard: "#1e1608", bgNav: "rgba(18,14,4,0.97)",
  },
  {
    id: "slate",
    name: "Серая", nameEn: "Slate",
    desc: "Нейтральный", descEn: "Neutral",
    primary: "#94a3b8", primaryHover: "#64748b",
    bg: "#0a0c10", bgCard: "#131620", bgNav: "rgba(10,12,16,0.97)",
  },
  // ── Разноцветные (Gradient) ──────────────────────────────────────
  {
    id: "aurora",
    name: "Аврора", nameEn: "Aurora",
    desc: "Северное сияние", descEn: "Northern lights",
    primary: "#8b5cf6", primaryHover: "#7c3aed",
    bg: "#080c18", bgCard: "#10142a", bgNav: "rgba(8,12,24,0.97)",
    gradient: ["#8b5cf6", "#06b6d4", "#22c55e"],
  },
  {
    id: "sunset",
    name: "Закат дня", nameEn: "Day Sunset",
    desc: "Огненный", descEn: "Fiery",
    primary: "#f97316", primaryHover: "#ea6f0e",
    bg: "#100808", bgCard: "#1e1010", bgNav: "rgba(16,8,8,0.97)",
    gradient: ["#f97316", "#f43f5e", "#a855f7"],
  },
  {
    id: "ocean",
    name: "Океан", nameEn: "Ocean",
    desc: "Глубины", descEn: "Depths",
    primary: "#0ea5e9", primaryHover: "#0284c7",
    bg: "#04101a", bgCard: "#071828", bgNav: "rgba(4,16,26,0.97)",
    gradient: ["#0ea5e9", "#6366f1", "#8b5cf6"],
  },
  {
    id: "candy",
    name: "Конфетти", nameEn: "Candy",
    desc: "Яркий", descEn: "Vivid",
    primary: "#ec4899", primaryHover: "#db2777",
    bg: "#100a14", bgCard: "#1a1020", bgNav: "rgba(16,10,20,0.97)",
    gradient: ["#ec4899", "#f97316", "#facc15"],
  },
  {
    id: "forest",
    name: "Лес", nameEn: "Forest",
    desc: "Природный микс", descEn: "Nature mix",
    primary: "#10b981", primaryHover: "#059669",
    bg: "#060e0a", bgCard: "#0c1810", bgNav: "rgba(6,14,10,0.97)",
    gradient: ["#10b981", "#3b82f6", "#8b5cf6"],
  },
];

const STORAGE_KEY = "cortex-theme-id";

export function getStoredThemeId(): string {
  try { return localStorage.getItem(STORAGE_KEY) || "midnight"; } catch { return "midnight"; }
}

export function getThemeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function storeThemeId(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
}

export async function saveThemeCloud(userId: string, themeId: string) {
  if (!userId || userId === "unknown") return;
  try {
    await setDoc(doc(db, "users", userId, "settings", "theme"), {
      themeId, updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch {}
}

export async function loadThemeCloud(userId: string): Promise<string | null> {
  if (!userId || userId === "unknown") return null;
  try {
    const snap = await getDoc(doc(db, "users", userId, "settings", "theme"));
    if (snap.exists()) return snap.data().themeId || null;
  } catch {}
  return null;
}

/** Получить CSS строку градиента или цвет для фона заголовков/карточек */
export function getAccentGradient(theme: Theme): string {
  if (theme.gradient && theme.gradient.length >= 2) {
    return `linear-gradient(135deg, ${theme.gradient.join(", ")})`;
  }
  return `linear-gradient(135deg, ${theme.primary}, ${theme.primaryHover})`;
}

/** Получить первый цвет из gradient или primary */
export function getSecondaryColor(theme: Theme): string {
  return theme.gradient?.[1] || theme.primaryHover;
}

/** Получить третий цвет из gradient или primaryHover */
export function getTertiaryColor(theme: Theme): string {
  return theme.gradient?.[2] || theme.primary;
}
