import { PropsWithChildren, useEffect } from "react";
import { initLanguageFromStorage } from "@/lib/i18n";
import { setupTelegram } from "@/lib/telegram";
import { usePersistTasks, getTelegramUserId } from "@/lib/store";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { paths, PERSONAL_WORKSPACE_ID } from "@/lib/workspacePaths";

async function registerUserOnOpen() {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    const user = tg.initDataUnsafe?.user;
    if (!user?.id) return;
    const userId = String(user.id);
    await setDoc(
      doc(db, paths.user(userId)),
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
      doc(db, paths.motivationSettings(userId))
    );
    if (!snap.exists()) return;
    const s = snap.data();
    if (s.enabled && s.mode !== "off") {
      tg.requestWriteAccess((granted: boolean) => {
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

function parseStartParam(): string | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith("w=")) {
      return startParam.replace("w=", "");
    }
  } catch {}
  return null;
}

function TelegramProviderInner({ children }: PropsWithChildren) {
  const { loadWorkspaces, setActiveWorkspaceId } = useWorkspace();
  usePersistTasks();

  useEffect(() => {
    setupTelegram();
    initLanguageFromStorage();

    const userId = getTelegramUserId();

    registerUserOnOpen().then(() =>
      checkAndRequestWriteAccess()
    );

    if (userId !== "unknown") {
      loadWorkspaces(userId);
    }

    // Deep link: открыть конкретный workspace
    const wsId = parseStartParam();
    if (wsId) {
      setActiveWorkspaceId(wsId);
      if (userId !== "unknown") {
        import("@/lib/store").then(({ useTaskStore }) => {
          useTaskStore.getState().setActiveWorkspaceId(wsId);
          useTaskStore
            .getState()
            .loadUserData(userId, wsId);
        });
      }
    }
  }, []);

  return <>{children}</>;
}

export default function TelegramProvider({
  children,
}: PropsWithChildren) {
  return (
    <TelegramProviderInner>{children}</TelegramProviderInner>
  );
}
