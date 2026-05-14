// Единая точка всех путей Firestore
// Меняй строки только здесь — нигде больше

export const PERSONAL_WORKSPACE_ID = "personal";

export const paths = {
  // Пользователь
  user: (userId: string) =>
    `users/${userId}`,

  userSettings: (userId: string, key: string) =>
    `users/${userId}/settings/${key}`,

  subscription: (userId: string) =>
    `subscriptions/${userId}`,

  // Workspaces
  userWorkspaces: (userId: string) =>
    `users/${userId}/workspaces`,

  userWorkspace: (userId: string, workspaceId: string) =>
    `users/${userId}/workspaces/${workspaceId}`,

  // Задачи внутри workspace
  tasks: (userId: string, workspaceId: string) =>
    `users/${userId}/workspaces/${workspaceId}/tasks`,

  task: (userId: string, workspaceId: string, taskId: string) =>
    `users/${userId}/workspaces/${workspaceId}/tasks/${taskId}`,

  // Бот-коллекция для напоминаний
  botTasks: () => `tasks`,

  // AI
  aiRequests: () => `ai_requests`,
  aiResponses: () => `ai_responses`,

  // Чаты
  chat: (userId: string, chatId: string) =>
    `users/${userId}/chats/${chatId}`,

  // Дни рождения
  birthdays: (userId: string) => `users/${userId}/birthdays`,
  birthday: (userId: string, id: string) => `users/${userId}/birthdays/${id}`,

  // Отпуска
  vacations: (userId: string) => `users/${userId}/vacations`,
  vacation: (userId: string, id: string) => `users/${userId}/vacations/${id}`,

  // Категории событий
  categoryEvents: (userId: string) => `users/${userId}/categoryEvents`,
  categoryEvent: (userId: string, id: string) =>
    `users/${userId}/categoryEvents/${id}`,

  // Цели недели
  weeklyGoals: (userId: string) => `users/${userId}/weeklyGoals`,
  weeklyGoal: (userId: string, id: string) =>
    `users/${userId}/weeklyGoals/${id}`,

  // Настройки
  motivationSettings: (userId: string) =>
    `users/${userId}/settings/motivation`,

  themeSettings: (userId: string) =>
    `users/${userId}/settings/theme`,

  migrationSettings: (userId: string) =>
    `users/${userId}/settings/migration`,

  // Старые пути (для миграции данных)
  legacyTasks: (userId: string) => `users/${userId}/tasks`,
  legacyTask: (userId: string, taskId: string) =>
    `users/${userId}/tasks/${taskId}`,
};
