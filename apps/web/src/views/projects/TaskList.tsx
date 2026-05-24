"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useTranslation } from "react-i18next";
import { TaskPriority, TaskResponse, TaskStatus } from "@/types/project/project";
import { useDeleteTask, useReorderTasks } from "@/hooks/useProjects";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { BiMenu, BiTrash } from "react-icons/bi";

const DRAG_TYPE = "PROJECT_TASK_LIST_ROW";

interface DragItem {
  index: number;
  id: number;
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  IN_PROGRESS:
    "bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber",
  DONE: "bg-husrev-moss/15 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  MEDIUM: "bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber",
  HIGH: "bg-husrev-amber/25 text-husrev-ember dark:bg-husrev-amber/35 dark:text-husrev-amber",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

function TaskRow({
  task,
  index,
  onMove,
  onDrop,
  onDelete,
}: {
  task: TaskResponse;
  index: number;
  onMove: (drag: number, hover: number) => void;
  onDrop: () => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { index, id: task.id },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop();
    },
  });
  const [, dropRef] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(item) {
      if (item.index === index) return;
      onMove(item.index, index);
      item.index = index;
    },
    drop: () => ({}),
  });
  dragRef(dropRef(ref));

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="group flex items-center gap-3 rounded-xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm px-3 py-2 transition hover:shadow-md dark:bg-husrev-shadow dark:ring-white/[0.06]"
    >
      <span className="cursor-grab text-gray-300 active:cursor-grabbing">
        <BiMenu size={14} />
      </span>
      <span className="flex-1 text-sm font-medium text-gray-800 dark:text-white/90 truncate">
        {task.title}
      </span>
      <span
        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[task.status]}`}
      >
        {t(`kanban.status.${task.status}`)}
      </span>
      <span
        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLOR[task.priority]}`}
      >
        {t(`kanban.priority.${task.priority}`)}
      </span>
      <button
        onClick={() => onDelete(task.id)}
        className="rounded-full p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
        aria-label={t("common.delete")}
      >
        <BiTrash size={14} />
      </button>
    </div>
  );
}

export default function TaskList({ code, tasks }: { code: string; tasks: TaskResponse[] }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const reorderTasks = useReorderTasks();
  const deleteTask = useDeleteTask();

  const sorted = [...tasks].sort((a, b) => a.position - b.position);
  const [ordered, setOrdered] = useState<TaskResponse[]>(sorted);
  const orderedRef = useRef<TaskResponse[]>(sorted);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) {
      const next = [...tasks].sort((a, b) => a.position - b.position);
      setOrdered(next);
      orderedRef.current = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const onMove = useCallback((drag: number, hover: number) => {
    dragging.current = true;
    setOrdered((prev) => {
      const next = [...prev];
      const [it] = next.splice(drag, 1);
      next.splice(hover, 0, it);
      orderedRef.current = next;
      return next;
    });
  }, []);

  const onDrop = useCallback(() => {
    dragging.current = false;
    const items = orderedRef.current.map((t, i) => ({ id: t.id, position: i }));
    reorderTasks.mutate(
      { code, items },
      {
        onError: (err) => {
          const { title, message } = parseAxiosError(err);
          showAlert({ title, message, type: "error", position: "top-center" });
        },
      },
    );
  }, [reorderTasks, code, showAlert]);

  const handleDelete = async (id: number) => {
    try {
      await deleteTask.mutateAsync({ id, code });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  if (ordered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-500 dark:border-gray-700">
        {t("kanban.noTasks")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {ordered.map((task, index) => (
        <TaskRow
          key={task.id}
          task={task}
          index={index}
          onMove={onMove}
          onDrop={onDrop}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
