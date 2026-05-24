import { PropsWithChildren, useEffect } from "react";
import { initLanguageFromStorage } from "@/lib/i18n";
import { setupTelegram } from "@/lib/telegram";
import { usePersistTasks, getTelegramUserId, getSafeUserId } from "@/lib/store";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { db, ensureAuth } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { paths, PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";

async function registerUserOnOpen() {
  try {
    // Сначала убеждаемся что Firebase Auth работает
    await ensureAuth();

    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    const userId = user?.id ? String(user.id) : getSafeUserId();

    await setDoc(
      doc(db, paths.user(userId)),
      {
        userId,
        chatId: userId,
        firstName: user?.first_name || "",
        lastName:  user?.last_name  || "",
        username:  user?.username   || "",
        lastSeen:  new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e: any) {
    // Не критично — продолжаем
    console.warn("registerUser:", e.message);
  }
}

async function checkAndRequestWriteAccess() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    const user = tg.initDataUnsafe?.user;
    if (!user?.id) return;
    const userId = String(user.id);
    const snap = await getDoc(doc(db, paths.motivationSettings(userId)));
    if (!snap.exists()) return;
    const s = snap.data();
    if (s.enabled && s.mode !== "off") {
      tg.requestWriteAccess((granted: boolean) => {
        if (!granted) {
          setDoc(doc(db, paths.motivationSettings(userId)), { enabled: false }, { merge: true }).catch(() => {});
        }
      });
    }
  } catch {}
}

function parseStartParam(): string | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith("w=")) return startParam.replace("w=", "");
  } catch {}
  return null;
}

function TelegramProviderInner({ children }: PropsWithChildren) {
  const { loadWorkspaces, setActiveWorkspaceId } = useWorkspace();
  usePersistTasks();

  useEffect(() => {
    setupTelegram();
    initLanguageFromStorage();

    // 1. Firebase Auth — самое первое действие
    ensureAuth().then(() => {
      // 2. Регистрируем пользователя
      registerUserOnOpen().then(() => checkAndRequestWriteAccess());

      // 3. Загружаем рабочие пространства
      const userId = getSafeUserId();
      if (userId) loadWorkspaces(userId);

      // 4. Deep link workspace
      const wsId = parseStartParam();
      if (wsId) {
        setActiveWorkspaceId(wsId);
        if (userId) {
          import("@/lib/store").then(({ useTaskStore }) => {
            useTaskStore.getState().setActiveWorkspaceId(wsId);
            useTaskStore.getState().loadUserData(userId, wsId);
          });
        }
      }
    });
  }, []); // eslint-disable-line

  return <>{children}</>;
}

export default function TelegramProvider({ children }: PropsWithChildren) {
  return <TelegramProviderInner>{children}</TelegramProviderInner>;
}
