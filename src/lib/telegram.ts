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
}function getWebApp(): TelegramSdk | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as Record<string, { WebApp?: TelegramSdk }>).Telegram;
  return tg?.WebApp ?? null;
}

export function setupTelegram() {
  const webApp = getWebApp();
  if (!webApp) return;

  try {
    webApp.ready();
    webApp.expand();
    if (webApp.themeParams?.bg_color) {
      webApp.setBackgroundColor(webApp.themeParams.bg_color);
    }
  } catch (error) {
    console.warn("Telegram SDK setup skipped:", error);
  }
}

export function getTelegramUser(): TgUser | null {
  const webApp = getWebApp();
  if (!webApp) return null;
  try {
    return webApp.initDataUnsafe?.user ?? null;
  } catch {
    return null;
  }
}

export function getThemeParams(): ThemeParams | null {
  const webApp = getWebApp();
  return webApp?.themeParams ?? null;
}

export function triggerHaptic(type: "light" | "medium" | "heavy" | "success" | "error" | "warning" = "medium") {
  const webApp = getWebApp();
  if (!webApp?.HapticFeedback) return;

  try {
    if (type === "success" || type === "error" || type === "warning") {
      webApp.HapticFeedback.notificationOccurred(type);
    } else {
      webApp.HapticFeedback.impactOccurred(type);
    }
  } catch (error) {
    console.debug("Haptic feedback not available:", error);
  }
}

export function selectionChanged() {
  const webApp = getWebApp();
  if (!webApp?.HapticFeedback) return;
  try {
    webApp.HapticFeedback.selectionChanged();
  } catch (error) {
    console.debug("Selection feedback not available:", error);
  }
}
