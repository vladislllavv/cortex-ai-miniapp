export type TgUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type HapticStyle = "light" | "medium" | "heavy" | "success" | "error" | "warning";

export function setupTelegram(): void {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    tg.ready?.();
    tg.expand?.();
  } catch {}
}

export function triggerHaptic(style: HapticStyle = "light"): void {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.HapticFeedback) return;
    if (style === "success" || style === "error" || style === "warning") {
      tg.HapticFeedback.notificationOccurred(style);
    } else {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch {}
}

export function showAlert(message: string): void {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.showAlert) {
      tg.showAlert(message);
    } else {
      alert(message);
    }
  } catch {}
}

export function showConfirm(message: string, callback: (confirmed: boolean) => void): void {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.showConfirm) {
      tg.showConfirm(message, callback);
    } else {
      callback(window.confirm(message));
    }
  } catch {}
}

export function openTelegramLink(url: string): void {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.open(url, "_blank");
    }
  } catch {}
}

export function getTelegramUser(): TgUser | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (!user?.id) return null;
    return {
      id: String(user.id),
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      photo_url: user.photo_url,
    };
  } catch {
    return null;
  }
}

export function closeMiniApp(): void {
  try {
    const tg = (window as any).Telegram?.WebApp;
    tg?.close?.();
  } catch {}
}
