type HapticStyle = "light" | "medium" | "heavy" | "success" | "error" | "warning";

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

export function getTelegramUser(): {
  id: string;
  name: string;
  username?: string;
} | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (!user) return null;
    return {
      id: String(user.id),
      name: [user.first_name, user.last_name].filter(Boolean).join(" "),
      username: user.username,
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
