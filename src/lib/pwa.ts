/**
 * PWA utilities — Service Worker registration + Push notifications
 */

/** Регистрируем Service Worker */
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    console.log("SW registered:", reg.scope);
    return reg;
  } catch (e) {
    console.warn("SW registration failed:", e);
    return null;
  }
}

/** Запрашиваем разрешение на уведомления */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
}

/** Показываем локальное уведомление */
export async function showLocalNotification(
  title: string,
  body: string,
  options?: { tag?: string; icon?: string; badge?: string; data?: any }
): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon:  options?.icon  || "/icons/icon-192.png",
        badge: options?.badge || "/icons/badge-72.png",
        tag:   options?.tag   || "cortexai",
        data:  options?.data,
        requireInteraction: false,
      });
    } else {
      new Notification(title, { body, icon: options?.icon });
    }
  } catch {}
}

/** Проверяем, поддерживается ли PWA установка */
export function isPWAInstallable(): boolean {
  return (window as any)._pwaInstallPrompt !== undefined;
}

/** Установить PWA */
export async function installPWA(): Promise<boolean> {
  const prompt = (window as any)._pwaInstallPrompt;
  if (!prompt) return false;
  prompt.prompt();
  const result = await prompt.userChoice;
  (window as any)._pwaInstallPrompt = undefined;
  return result.outcome === "accepted";
}

/** Слушаем beforeinstallprompt */
export function setupPWAInstallListener(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    (window as any)._pwaInstallPrompt = e;
  });
}

/** Планируем напоминание о задаче через setTimeout (для браузера) */
export function scheduleTaskReminder(
  title: string,
  dueDate: string,
  offsetMinutes = 30
): NodeJS.Timeout | null {
  try {
    const due    = new Date(dueDate);
    const notify = new Date(due.getTime() - offsetMinutes * 60 * 1000);
    const delay  = notify.getTime() - Date.now();
    if (delay <= 0 || delay > 24 * 60 * 60 * 1000) return null; // only schedule within 24h

    return setTimeout(() => {
      showLocalNotification(
        "CortexAI ⚡",
        `📌 ${title} — через ${offsetMinutes} мин`,
        { tag: `reminder-${title}` }
      );
    }, delay);
  } catch {
    return null;
  }
}
