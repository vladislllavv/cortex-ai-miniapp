import { useEffect, useState } from "react";
import { getTelegramUser, setupTelegram, type TgUser } from "@/lib/telegram";

export function useTelegram() {
  const [user, setUser] = useState<TgUser | null>(null);

  useEffect(() => {
    setupTelegram();
    setUser(getTelegramUser());
  }, []);

  return { user };
}
