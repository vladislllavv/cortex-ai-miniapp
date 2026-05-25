export type TgUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};

type HapticStyle = "light" | "medium" | "heavy" | "success" | "error" | "warning";

// ═══════════════════════════════════════════════════════════════════
// НАСТРОЙКИ — реальный username бота
// ═══════════════════════════════════════════════════════════════════
export const BOT_USERNAME = "aiplannerrubot";
export const APP_NAME     = "cortexai"; // не используется в ссылках — ссылка идёт через бота

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
    if (tg?.showAlert) { tg.showAlert(message); }
    else { alert(message); }
  } catch {}
}

export function showConfirm(message: string, callback: (confirmed: boolean) => void): void {
  try {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.showConfirm) { tg.showConfirm(message, callback); }
    else { callback(window.confirm(message)); }
  } catch {}
}

export async function tgConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
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
}

export function getTelegramUser(): TgUser | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    if (!user?.id) return null;
    return {
      id:         String(user.id),
      first_name: user.first_name,
      last_name:  user.last_name,
      username:   user.username,
      photo_url:  user.photo_url,
    };
  } catch {
    return null;
  }
}

export function closeMiniApp(): void {
  try { (window as any).Telegram?.WebApp?.close(); } catch {}
}

// ─── Ссылки приглашения ──────────────────────────────────────────────

/**
 * Строим ссылку для вступления в команду.
 * Формат: https://t.me/aiplannerrubot?start=join_INVITECODE
 * Пользователь нажимает → бот открывает приложение.
 * Параметр start_param читается в parseStartParam().
 */
export function buildInviteLink(inviteCode: string): string {
  return `https://t.me/${BOT_USERNAME}?start=join_${inviteCode}`;
}

/** Ссылка для прямого открытия мини-апп через /start параметр */
export function buildDirectLink(inviteCode: string): string {
  // Если WEBAPP_URL задан — используем прямую ссылку
  const webAppUrl = (window as any).__WEBAPP_URL__ || "";
  if (webAppUrl) {
    return `${webAppUrl}?join=${inviteCode}`;
  }
  return buildInviteLink(inviteCode);
}

export function shareInviteToTelegram(
  inviteCode: string,
  wsName: string,
  ru: boolean
): void {
  try {
    const tg   = (window as any).Telegram?.WebApp;
    const link = buildInviteLink(inviteCode);
    const text = ru
      ? `🚀 Присоединяйся к команде «${wsName}» в CortexAI!\n\nНажми ссылку ниже или введи код вручную: ${inviteCode}\n\n${link}`
      : `🚀 Join team "${wsName}" in CortexAI!\n\nClick the link or enter code: ${inviteCode}\n\n${link}`;

    if (tg?.openTelegramLink) {
      // Делимся через Telegram share sheet
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
      tg.openTelegramLink(shareUrl);
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard?.writeText(text).catch(() => {});
      alert(ru ? "Ссылка скопирована!" : "Link copied!");
    }
  } catch (e: any) {
    console.warn("shareInviteToTelegram:", e.message);
  }
}

export async function copyInviteLink(inviteCode: string): Promise<void> {
  const link = buildInviteLink(inviteCode);
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    const el = document.createElement("textarea");
    el.value = link;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

export async function copyInviteCode(code: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const el = document.createElement("textarea");
    el.value = code;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

// ─── Парсинг параметров запуска ──────────────────────────────────────

/**
 * Парсим start_param из Telegram WebApp.
 * Поддерживаем форматы:
 *   join_INVITECODE  → { type: "join", code: "INVITECODE" }
 *   w=WORKSPACE_ID   → { type: "workspace", id: "..." }
 */
export function parseStartParam(): { type: "join"; code: string } | { type: "workspace"; id: string } | null {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param || "";

    if (startParam.startsWith("join_")) {
      const code = startParam.replace("join_", "").toUpperCase();
      if (code.length >= 6) return { type: "join", code };
    }

    if (startParam.startsWith("w=")) {
      return { type: "workspace", id: startParam.replace("w=", "") };
    }

    // Также проверяем URL параметры (для веб-версии)
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode  = urlParams.get("join");
    if (joinCode) return { type: "join", code: joinCode.toUpperCase() };

    const wsId = urlParams.get("w");
    if (wsId) return { type: "workspace", id: wsId };
  } catch {}
  return null;
}
