import { useState, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useTaskStore, Task } from "@/lib/store";
import TaskCard from "./TaskCard";

interface Props {
  tasks: Task[];
  /** Optional: called after reorder to persist */
  onReorder?: (ordered: Task[]) => void;
}

export default function DraggableTaskList({ tasks, onReorder }: Props) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const [items, setItems] = useState<Task[]>(tasks);

  // Sync if parent tasks change (e.g. new task added)
  const sortedTasks = [...tasks].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const handleReorder = useCallback((newOrder: Task[]) => {
    setItems(newOrder);
    // Persist sortOrder
    newOrder.forEach((task, idx) => {
      if (task.sortOrder !== idx) {
        updateTask(task.id, { sortOrder: idx });
      }
    });
    onReorder?.(newOrder);
  }, [updateTask, onReorder]);

  if (tasks.length === 0) return null;

  return (
    <Reorder.Group
      axis="y"
      values={sortedTasks}
      onReorder={handleReorder}
      style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }}
    >
      {sortedTasks.map((task) => (
        <Reorder.Item
          key={task.id}
          value={task}
          style={{ cursor: "grab" }}
          whileDrag={{
            scale: 1.02,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            zIndex: 10,
          }}
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        >
          <TaskCard task={task} />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}
