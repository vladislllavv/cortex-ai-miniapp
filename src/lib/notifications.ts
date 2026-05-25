// Клиент для отправки уведомлений через Cloudflare Worker

// ⚠️ ЗАМЕНИ на URL твоего Worker'а уведомлений
const NOTIFICATIONS_WORKER_URL = "https://ancient-river-8a20.bubo-buboff.workers.dev"; // Using main worker

export type NotificationType =
  | "task_assigned"
  | "task_completed"
  | "member_joined"
  | "added_to_workspace"
  | "role_changed"
  | "removed_from_workspace"
  | "workspace_deleted"
  | "deadline_soon"
  | "test";

export interface NotificationPayload {
  taskTitle?: string;
  taskId?: string;
  workspaceName?: string;
  workspaceId?: string;
  assignedBy?: string;
  completedBy?: string;
  memberName?: string;
  addedBy?: string;
  changedBy?: string;
  deletedBy?: string;
  newRole?: string;
  priority?: string;
  dueDate?: string;
  timeLeft?: string;
  text?: string;
}

/**
 * Отправляет уведомление пользователю в Telegram
 * recipientId = Telegram user id (как строка или число)
 */
export async function sendNotification(
  type: NotificationType,
  recipientId: string,
  payload: NotificationPayload = {}
): Promise<boolean> {
  try {
    if (!recipientId || recipientId === "unknown") return false;

    const response = await fetch(NOTIFICATIONS_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        recipientId: String(recipientId),
        payload,
      }),
    });

    if (!response.ok) {
      console.error("Notification failed:", await response.text());
      return false;
    }

    const data = await response.json();
    return data.ok === true;
  } catch (e: any) {
    console.error("sendNotification error:", e.message);
    return false;
  }
}

/**
 * Массовая отправка уведомлений нескольким получателям
 */
export async function sendNotificationBatch(
  type: NotificationType,
  recipientIds: string[],
  payload: NotificationPayload = {}
): Promise<{ sent: number; failed: number }> {
  const results = await Promise.all(
    recipientIds.map((id) => sendNotification(type, id, payload))
  );
  return {
    sent: results.filter((r) => r).length,
    failed: results.filter((r) => !r).length,
  };
}
