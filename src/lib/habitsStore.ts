/**
 * Habits Store — трекер привычек со streak
 */
import { create } from "zustand";
import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc, getDocs, onSnapshot,
  Unsubscribe, query, where,
} from "firebase/firestore";

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  frequency: "daily" | "weekdays" | "weekends" | "custom";
  customDays?: number[]; // 0=Sun, 1=Mon, ... 6=Sat
  createdAt: string;
  /** ISO dates when completed, e.g. ["2026-05-23"] */
  completedDates: string[];
  /** Текущий streak */
  streak: number;
  /** Лучший streak */
  bestStreak: number;
  archived?: boolean;
}

interface HabitsStore {
  habits: Habit[];
  loading: boolean;
  unsub: Unsubscribe | null;
  subscribe: (userId: string) => void;
  unsubscribe: () => void;
  addHabit: (userId: string, data: Omit<Habit, "id" | "createdAt" | "completedDates" | "streak" | "bestStreak">) => Promise<void>;
  toggleToday: (userId: string, habitId: string) => Promise<void>;
  deleteHabit: (userId: string, habitId: string) => Promise<void>;
  archiveHabit: (userId: string, habitId: string) => Promise<void>;
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function calcStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const sorted = [...dates].sort().reverse();
  const today = getTodayStr();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split("T")[0];

  // Streak counts if today or yesterday is included
  if (sorted[0] !== today && sorted[0] !== yStr) return 0;

  let streak = 0;
  let current = new Date();
  if (sorted[0] === yStr) current.setDate(current.getDate() - 1);

  for (let i = 0; i < sorted.length; i++) {
    const d = current.toISOString().split("T")[0];
    if (sorted[i] === d) {
      streak++;
      current.setDate(current.getDate() - 1);
    } else break;
  }
  return streak;
}

export const useHabitsStore = create<HabitsStore>((set, get) => ({
  habits: [],
  loading: false,
  unsub: null,

  subscribe: (userId) => {
    const prev = get().unsub;
    if (prev) prev();
    if (!userId) return;

    const unsub = onSnapshot(
      collection(db, "users", userId, "habits"),
      (snap) => {
        const habits: Habit[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Habit, "id">),
        }));
        // Recalculate streaks on load
        habits.forEach((h) => {
          h.streak = calcStreak(h.completedDates || []);
        });
        set({ habits: habits.filter((h) => !h.archived) });
      },
      () => set({ habits: [] })
    );
    set({ unsub });
  },

  unsubscribe: () => {
    const { unsub } = get();
    if (unsub) unsub();
    set({ unsub: null, habits: [] });
  },

  addHabit: async (userId, data) => {
    const id = `habit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const habit: Habit = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
      completedDates: [],
      streak: 0,
      bestStreak: 0,
    };
    await setDoc(doc(db, "users", userId, "habits", id), habit);
  },

  toggleToday: async (userId, habitId) => {
    const today = getTodayStr();
    const habit = get().habits.find((h) => h.id === habitId);
    if (!habit) return;

    const dates = habit.completedDates || [];
    const isDone = dates.includes(today);
    const newDates = isDone ? dates.filter((d) => d !== today) : [...dates, today];
    const streak = calcStreak(newDates);
    const bestStreak = Math.max(habit.bestStreak || 0, streak);

    await setDoc(
      doc(db, "users", userId, "habits", habitId),
      { completedDates: newDates, streak, bestStreak },
      { merge: true }
    );
  },

  deleteHabit: async (userId, habitId) => {
    await deleteDoc(doc(db, "users", userId, "habits", habitId));
  },

  archiveHabit: async (userId, habitId) => {
    await setDoc(
      doc(db, "users", userId, "habits", habitId),
      { archived: true },
      { merge: true }
    );
  },
}));

export { getTodayStr, calcStreak };
