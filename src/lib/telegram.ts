export type TgUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type HapticStyle = "light" | "medium" | "heavy" | "success" | "error" | "warning";

// ═══════════════════════════════════════════════════════════════════
// НАСТРОЙКИ БОТА — ЗАМЕНИ НА СВОИ
// ═══════════════════════════════════════════════════════════════════
export const BOT_USERNAME = "CortexAITaskBot"; // aiplannerrubot
export const APP_NAME = "app";                 // short_name Mini App из @BotFather
// ═══════════════════════════════════════════════════════════════════

// ─── Базовые функции ────────────────────────────────────────────────

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

// ─── Алиасы для team-функционала ────────────────────────────────────

export const haptic = triggerHaptic;
export const getTgUser = getTelegramUser;

export const tgAlert = (message: string): Promise<void> =>
  new Promise((resolve) => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.showAlert) {
        tg.showAlert(message, () => resolve());
      } else {
        alert(message);
        resolve();
      }
    } catch {
      resolve();
    }
  });

export const tgConfirm = (message: string): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.showConfirm) {
        tg.showConfirm(message, (ok: boolean) => resolve(ok));
      } else {
        resolve(window.confirm(message));
      }
    } catch {
      resolve(false);
    }
  });

// ─── Инвайт-ссылки и старт-параметры ────────────────────────────────

export function getStartParam(): string | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    return tg?.initDataUnsafe?.start_param || null;
  } catch {
    return null;
  }
}

export function parseStartParam(): { type: "join"; code: string } | null {
  const param = getStartParam();
  if (!param) return null;
  if (param.startsWith("join_")) {
    return { type: "join", code: param.substring(5) };
  }
  return null;
}

export function buildInviteLink(inviteCode: string): string {
  return `https://t.me/${BOT_USERNAME}/${APP_NAME}?startapp=join_${inviteCode}`;
}

export function shareInviteToTelegram(
  inviteCode: string,
  wsName: string,
  ru: boolean
): void {
  const link = buildInviteLink(inviteCode);
  const text = ru
    ? `🚀 Присоединяйся к команде «${wsName}» в CortexAI!\n\nКод: ${inviteCode}`
    : `🚀 Join team "${wsName}" in CortexAI!\n\nCode: ${inviteCode}`;

  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;

  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else if (navigator.share) {
      navigator.share({ title: wsName, text, url: link }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${text}\n\n${link}`).catch(() => {});
    }
  } catch {}
}

export async function copyInviteLink(inviteCode: string): Promise<void> {
  const link = buildInviteLink(inviteCode);
  try {
    await navigator.clipboard.writeText(link);
    triggerHaptic("success");
  } catch {}
}

export async function copyInviteCode(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    triggerHaptic("success");
  } catch {}
}
