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
}

export const THEMES: Theme[] = [
  {
    id: "dark-blue",
    name: "Синяя", nameEn: "Blue",
    primary: "#3b82f6", primaryHover: "#2563eb",
    bg: "#0f172a", bgCard: "#1e293b", bgNav: "rgba(10,15,30,0.98)",
  },
  {
    id: "dark-purple",
    name: "Фиолетовая", nameEn: "Purple",
    primary: "#a855f7", primaryHover: "#9333ea",
    bg: "#0f0820", bgCard: "#1a1030", bgNav: "rgba(12,5,28,0.98)",
  },
  {
    id: "dark-green",
    name: "Зелёная", nameEn: "Green",
    primary: "#22c55e", primaryHover: "#16a34a",
    bg: "#071a0f", bgCard: "#0d2518", bgNav: "rgba(5,18,10,0.98)",
  },
  {
    id: "dark-red",
    name: "Красная", nameEn: "Red",
    primary: "#ef4444", primaryHover: "#dc2626",
    bg: "#1a0808", bgCard: "#2a1010", bgNav: "rgba(18,5,5,0.98)",
  },
  {
    id: "dark-orange",
    name: "Оранжевая", nameEn: "Orange",
    primary: "#f97316", primaryHover: "#ea6f0e",
    bg: "#1a0f05", bgCard: "#2a1a08", bgNav: "rgba(18,10,3,0.98)",
  },
  {
    id: "dark-cyan",
    name: "Голубая", nameEn: "Cyan",
    primary: "#06b6d4", primaryHover: "#0891b2",
    bg: "#051a20", bgCard: "#082530", bgNav: "rgba(3,15,20,0.98)",
  },
];

const STORAGE_KEY = "cortex-theme-id";

export function getStoredThemeId(): string {
  try { return localStorage.getItem(STORAGE_KEY) || "dark-blue"; } catch { return "dark-blue"; }
}

export function getThemeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export function storeThemeId(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
}

export async function saveThemeCloud(userId: string, themeId: string) {
  if (userId === "unknown") return;
  try {
    await setDoc(doc(db, "users", userId, "settings", "theme"), {
      themeId,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("saveThemeCloud error:", e);
  }
}

export async function loadThemeCloud(userId: string): Promise<string | null> {
  if (userId === "unknown") return null;
  try {
    const snap = await getDoc(doc(db, "users", userId, "settings", "theme"));
    if (snap.exists()) return snap.data().themeId || null;
  } catch {}
  return null;
}
