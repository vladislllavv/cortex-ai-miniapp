startSync: (userId) => {
  if (userId === "unknown") return () => {};

  // Используем includeMetadataChanges для мгновенной синхронизации
  const unsubTasks = onSnapshot(
    collection(db, "users", userId, "tasks"),
    { includeMetadataChanges: false },
    (snapshot) => {
      // Обрабатываем только реальные изменения с сервера
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const todayStr = new Date().toISOString().split("T")[0];

      const cloudMap = new Map<string, Task>();
      snapshot.forEach((d) => {
        const data = d.data();

        if (data.status === "done" && data.completedAt && data.repeat !== "daily") {
          if (new Date(data.completedAt) < yesterday) return;
        }

        if (data.repeat === "daily" && data.status === "done" && data.completedAt) {
          const completedDay = data.completedAt.split("T")[0];
          if (completedDay < todayStr) {
            cloudMap.set(d.id, normalizeTask({
              ...data, id: d.id,
              status: "todo",
              completedAt: undefined,
            }));
            return;
          }
        }

        cloudMap.set(d.id, normalizeTask({ ...data, id: d.id }));
      });

      set((state) => {
        const merged: Task[] = [];
        const localMap = new Map(state.tasks.map((t) => [t.id, t]));

        cloudMap.forEach((cloudTask) => {
          const localTask = localMap.get(cloudTask.id);
          if (localTask) {
            const cloudTime = cloudTask.updatedAt || cloudTask.completedAt || cloudTask.createdAt || "";
            const localTime = localTask.updatedAt || localTask.completedAt || localTask.createdAt || "";
            merged.push(cloudTime >= localTime ? cloudTask : localTask);
          } else {
            merged.push(cloudTask);
          }
        });

        localMap.forEach((localTask) => {
          if (!cloudMap.has(localTask.id)) {
            merged.push(localTask);
            saveTaskToFirebase(localTask, userId).catch(console.error);
          }
        });

        saveTasks(merged);
        return { tasks: merged, isSynced: true };
      });
    },
    (error) => console.error("Sync error:", error)
  );

  return () => unsubTasks();
},
