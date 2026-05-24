import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  enableNetwork,
  disableNetwork,
} from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyASx0saii-gMIHmCC_e3i7gAIqL6NxUMZ4",
  authDomain: "cortexai-65075.firebaseapp.com",
  projectId: "cortexai-65075",
  storageBucket: "cortexai-65075.firebasestorage.app",
  messagingSenderId: "417649566965",
  appId: "1:417649566965:web:f36c20a9e7af9a77da91bc",
};

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

export const db   = getFirestore(app);
export const auth = getAuth(app);

// ── Anonymous sign-in ────────────────────────────────────────────────────
// Автоматически входим анонимно — это даёт request.auth != null
// и позволяет Firebase Rules разрешить запись.
// Telegram userId хранится отдельно в store.ts

let authReady = false;
let authReadyResolve: () => void;
export const authReadyPromise = new Promise<void>(res => {
  authReadyResolve = res;
});

export let currentUser: User | null = null;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!authReady) {
    authReady = true;
    authReadyResolve();
  }
});

// Входим анонимно при старте (idempotent — повторный вход не создаёт нового пользователя)
export async function ensureAuth(): Promise<User | null> {
  // Если уже залогинен — просто возвращаем
  if (auth.currentUser) return auth.currentUser;

  // Ждём initialisation
  await authReadyPromise;
  if (auth.currentUser) return auth.currentUser;

  // Входим анонимно
  try {
    const cred = await signInAnonymously(auth);
    currentUser = cred.user;
    console.log("✅ Firebase Auth: anonymous sign-in", cred.user.uid);
    return cred.user;
  } catch (e: any) {
    console.warn("⚠️ Firebase anonymous auth failed:", e.message);
    return null;
  }
}

// Инициируем вход немедленно при загрузке модуля
if (typeof window !== "undefined") {
  ensureAuth().catch(() => {});

  window.addEventListener("online",  () => enableNetwork(db).catch(() => {}));
  window.addEventListener("offline", () => disableNetwork(db).catch(() => {}));
}
