export type TgUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

export type ThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
};

type HapticFeedbackType = "light" | "medium" | "heavy" | "rigid" | "soft";

type TelegramSdk = {
  ready: () => void;
  expand: () => void;
  initDataUnsafe?: {
    user?: TgUser;
  };
  themeParams?: ThemeParams;
  HapticFeedback?: {
    impactOccurred: (style: HapticFeedbackType) => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
};

function getWebApp(): TelegramSdk | null {
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
