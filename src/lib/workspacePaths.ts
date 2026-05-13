// Единая точка путей Firestore — менять строки только здесь

export const paths = {
  // Пользователь
  user: (userId: string) =>
    `users/${userId}`,

  // Настройки пользователя
  userSettings: (userId: string, key: string) =>
    `users/${userId}/settings/${key}`,

  // Подписка
  subscription: (userId: string) =>
    `subscriptions/${userId}`,

  // Workspaces пользователя
  userWorkspaces: (userId: string) =>
    `users/${userId}/workspaces`,

  userWorkspace: (userId: string, workspaceId: string) =>
    `users/${userId}/workspaces/${workspaceId}`,

  // Задачи внутри workspace
  tasks: (userId: string, workspaceId: string) =>
    `users/${userId}/workspaces/${workspaceId}/tasks`,

  task: (userId: string, workspaceId: string, taskId: string) =>
    `users/${userId}/workspaces/${workspaceId}/tasks/${taskId}`,

  // Бот-задачи (корневая коллекция для напоминаний)
  botTasks: () => `tasks`,

  // AI запросы / ответы
  aiRequests: () => `ai_requests`,
  aiResponses: () => `ai_responses`,

  // Чаты
  chat: (userId: string, chatId: string) =>
    `users/${userId}/chats/${chatId}`,

  // Дни рождения
  birthdays: (userId: string) =>
    `users/${userId}/birthdays`,

  birthday: (userId: string, id: string) =>
    `users/${userId}/birthdays/${id}`,

  // Отпуска
  vacations: (userId: string) =>
    `users/${userId}/vacations`,

  vacation: (userId: string, id: string) =>
    `users/${userId}/vacations/${id}`,

  // Категории событий
  categoryEvents: (userId: string) =>
    `users/${userId}/categoryEvents`,

  categoryEvent: (userId: string, id: string) =>
    `users/${userId}/categoryEvents/${id}`,

  // Цели недели
  weeklyGoals: (userId: string) =>
    `users/${userId}/weeklyGoals`,

  weeklyGoal: (userId: string, id: string) =>
    `users/${userId}/weeklyGoals/${id}`,

  // Миграция
  migration: (userId: string) =>
    `users/${userId}/settings/migration`,

  // Старый путь задач (для миграции)
  legacyTasks: (userId: string) =>
    `users/${userId}/tasks`,

  legacyTask: (userId: string, taskId: string) =>
    `users/${userId}/tasks/${taskId}`,
};

// ID личного workspace
export const PERSONAL_WORKSPACE_ID = "personal";
