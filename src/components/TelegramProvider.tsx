import { PropsWithChildren, useEffect } from "react";
import { initLanguageFromStorage } from "@/lib/i18n";
import { setupTelegram } from "@/lib/telegram";
import { usePersistTasks, getTelegramUserId } from "@/lib/store";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";

async function registerUserOnOpen() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    const user = tg.initDataUnsafe?.user;
    if (!user?.id) return;
    const userId = String(user.id);
    await setDoc(
      doc(db, "users", userId),
      {
        userId,
        chatId: userId,
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        username: user.username || "",
        lastSeen: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error("registerUser:", e);
  }
}

async function checkAndRequestWriteAccess() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    const user = tg.initDataUnsafe?.user;
    if (!user?.id) return;
    const userId = String(user.id);
    const snap = await getDoc(
      doc(db, "users", userId, "settings", "motivation")
    );
    if (!snap.exists()) return;
    const s = snap.data();
    if (s.enabled && s.mode !== "off") {
      tg.requestWriteAccess((granted: boolean) => {
        if (!granted) {
          setDoc(
            doc(db, "users", userId, "settings", "motivation"),
            { enabled: false },
            { merge: true }
          ).catch(() => {});
        }
      });
    }
  } catch {}
}

function TelegramProviderInner({ children }: PropsWithChildren) {
  const { loadWorkspaces } = useWorkspace();
  usePersistTasks();

  useEffect(() => {
    setupTelegram();
    initLanguageFromStorage();
    registerUserOnOpen().then(() => checkAndRequestWriteAccess());

    const userId = getTelegramUserId();
    if (userId !== "unknown") {
      loadWorkspaces(userId);
    }

    // Deep link: start_param = workspace id
    try {
      const tg = (window as any).Telegram?.WebApp;
      const startParam = tg?.initDataUnsafe?.start_param;
      if (startParam && startParam.startsWith("w=")) {
        const wsId = startParam.replace("w=", "");
        if (wsId) {
          localStorage.setItem("cortex-active-workspace", wsId);
        }
      }
    } catch {}
  }, []);

  return <>{children}</>;
}

export default function TelegramProvider({ children }: PropsWithChildren) {
  return <TelegramProviderInner>{children}</TelegramProviderInner>;
}
