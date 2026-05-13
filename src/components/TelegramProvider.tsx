import { PropsWithChildren, useEffect } from "react";
import { initLanguageFromStorage } from "@/lib/i18n";
import { setupTelegram } from "@/lib/telegram";
import { usePersistTasks, getTelegramUserId } from "@/lib/store";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

// ✅ Регистрируем пользователя в Firebase при каждом открытии приложения
async function registerUserOnAppOpen() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;

    const user = tg.initDataUnsafe?.user;
    if (!user?.id) return;

    const userId = String(user.id);

    // Сохраняем пользователя — бот увидит его и сможет слать мотивацию
    await setDoc(
      doc(db, "users", userId),
      {
        userId,
        chatId: userId,
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        username: user.username || "",
        lastSeen: new Date().toISOString(),
        appVersion: "2.0",
      },
      { merge: true }
    );

    console.log(`✅ User registered: ${userId} (${user.first_name})`);
  } catch (e) {
    console.error("Register user error:", e);
  }
}

// ✅ Проверяем и запрашиваем write access если мотивация включена
async function checkAndRequestWriteAccess() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;

    const user = tg.initDataUnsafe?.user;
    if (!user?.id) return;

    const userId = String(user.id);

    // Проверяем настройки мотивации
    const settingSnap = await getDoc(
      doc(db, "users", userId, "settings", "motivation")
    );

    if (!settingSnap.exists()) return;

    const settings = settingSnap.data();

    // Если мотивация включена — тихо запрашиваем write access
    if (settings.enabled && settings.mode !== "off") {
      tg.requestWriteAccess((granted: boolean) => {
        console.log(`Write access: ${granted ? "granted" : "denied"}`);
        if (!granted) {
          // Если отказал — отключаем мотивацию чтобы не спамить
          setDoc(
            doc(db, "users", userId, "settings", "motivation"),
            { enabled: false },
            { merge: true }
          ).catch(() => {});
        }
      });
    }
  } catch (e) {
    console.error("Write access check error:", e);
  }
}

export default function TelegramProvider({ children }: PropsWithChildren) {
  usePersistTasks();

  useEffect(() => {
    setupTelegram();
    initLanguageFromStorage();

    // ✅ При каждом открытии приложения:
    // 1. Регистрируем пользователя в Firebase
    // 2. Проверяем и запрашиваем write access для мотивации
    registerUserOnAppOpen().then(() => {
      checkAndRequestWriteAccess();
    });
  }, []);

  return <>{children}</>;
}
