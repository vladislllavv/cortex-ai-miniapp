import { PropsWithChildren, useEffect } from "react";
import { initLanguageFromStorage } from "@/lib/i18n";
import { setupTelegram } from "@/lib/telegram";
import { usePersistTasks } from "@/lib/store";

export default function TelegramProvider({ children }: PropsWithChildren) {
  usePersistTasks();

  useEffect(() => {
    setupTelegram();
    initLanguageFromStorage();
  }, []);

  return <>{children}</>;
}
