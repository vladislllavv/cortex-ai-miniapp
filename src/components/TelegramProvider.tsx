import { PropsWithChildren, useEffect } from "react";
import { initLanguageFromStorage } from "@/lib/i18n";
import { setupTelegram } from "@/lib/telegram";
import { usePersistTasks, getTelegramUserId, getSafeUserId, useTaskStore } from "@/lib/store";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { paths, PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";

/** Регистрируем пользователя при открытии приложения */
async function registerUserOnOpen() {
  try {
    const userId = getSafeUserId();
    if (!userId) return;

    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;

    await setDoc(
      doc(db, paths.user(userId)),
      {
        userId,
        chatId: userId,
        firstName: user?.first_name || "",
        lastName:  user?.last_name  || "",
        username:  user?.username   || "",
        lastSeen:  new Date().toISOString(),
        // Сохраняем последнее устройство
        lastDevice: typeof window !== "undefined" ? (
          /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop"
        ) : "unknown",
      },
      { merge: true }
    );
  } catch (e: any) {
    console.warn("registerUser:", e.message);
  }
}

/** Запрашиваем разрешение на отправку мотивационных уведомлений */
async function checkAndRequestWriteAccess() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    const userId = getTelegramUserId();
    if (!userId) return;

    const snap = await getDoc(doc(db, paths.motivationSettings(userId)));
    if (!snap.exists()) return;
    const s = snap.data();
    if (s.enabled && s.mode !== "off") {
      tg.requestWriteAccess?.((granted: boolean) => {
        if (!granted) {
          setDoc(
            doc(db, paths.motivationSettings(userId)),
            { enabled: false },
            { merge: true }
          ).catch(() => {});
        }
      });
    }
  } catch {}
}

/** Парсим deep link параметр */
function parseStartParam(): string | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam?.startsWith("w=")) return startParam.replace("w=", "");
  } catch {}
  return null;
}

function TelegramProviderInner({ children }: PropsWithChildren) {
  const { loadWorkspaces, setActiveWorkspaceId } = useWorkspace();
  usePersistTasks();

  useEffect(() => {
    setupTelegram();
    initLanguageFromStorage();

    const userId = getSafeUserId();

    // 1. Регистрируем пользователя
    registerUserOnOpen();

    // 2. Загружаем данные из Firebase (синхронизация между устройствами)
    if (userId) {
      // Загружаем workspace и задачи
      const store = useTaskStore.getState();
      store.loadUserData(userId, PERSONAL_WORKSPACE_ID);

      // Запускаем real-time синхронизацию
      const unsub = store.startSync(userId, PERSONAL_WORKSPACE_ID);
      window.__taskSyncUnsub = unsub;

      // Загружаем рабочие пространства команды
      loadWorkspaces(userId);

      // Запрашиваем доступ к уведомлениям
      setTimeout(() => checkAndRequestWriteAccess(), 2000);
    }

    // 3. Deep link workspace
    const wsId = parseStartParam();
    if (wsId && userId) {
      setActiveWorkspaceId(wsId);
      const store = useTaskStore.getState();
      store.setActiveWorkspaceId(wsId);
      store.loadUserData(userId, wsId);
    }

    return () => {
      // Отписываемся от real-time при размонтировании
      if ((window as any).__taskSyncUnsub) {
        (window as any).__taskSyncUnsub();
      }
    };
  }, []); // eslint-disable-line

  return <>{children}</>;
}

export default function TelegramProvider({ children }: PropsWithChildren) {
  return <TelegramProviderInner>{children}</TelegramProviderInner>;
}
