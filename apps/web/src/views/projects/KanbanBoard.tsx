"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useTranslation } from "react-i18next";
import { TaskPriority, TaskResponse, TaskStatus } from "@/types/project/project";
import { useDeleteTask, useReorderTasks, useRestoreTask, useUpdateTask } from "@/hooks/useProjects";
import { alertStore, showUndoToast } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatDate } from "@/utils/i18n-date";
import { BiTrash } from "react-icons/bi";
import MemberAvatar from "./MemberAvatar";

const DRAG_TYPE = "PROJECT_TASK";

interface DragItem {
  id: number;
  fromStatus: TaskStatus;
  fromIndex: number;
}

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"];

const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: "bg-gray-400",
  IN_PROGRESS: "bg-husrev-amber",
  DONE: "bg-husrev-moss",
  CANCELLED: "bg-red-400",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  LOW: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  MEDIUM: "bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber",
  HIGH: "bg-husrev-amber/25 text-husrev-ember dark:bg-husrev-amber/35 dark:text-husrev-amber",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

function TaskCard({
  task,
  index,
  onMoveSameColumn,
  onDelete,
  onDropEnd,
  onSelect,
  canEdit,
}: {
  task: TaskResponse;
  index: number;
  onMoveSameColumn: (status: TaskStatus, drag: number, hover: number) => void;
  onDelete: (id: number) => void;
  onDropEnd: (didDrop: boolean) => void;
  onSelect: (task: TaskResponse) => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { id: task.id, fromStatus: task.status, fromIndex: index },
    canDrag: canEdit,
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => onDropEnd(monitor.didDrop()),
  });

  const [, dropRef] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(item) {
      if (item.fromStatus !== task.status) return;
      if (item.fromIndex === index) return;
      onMoveSameColumn(task.status, item.fromIndex, index);
      item.fromIndex = index;
    },
    drop: () => ({}),
  });

  dragRef(dropRef(ref));

  return (
    <div
      ref={ref}
      onClick={() => onSelect(task)}
      style={{
        opacity: isDragging ? 0.4 : 1,
        transform: isDragging ? "rotate(-1deg) scale(0.98)" : undefined,
      }}
      className="group cursor-grab rounded-xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing dark:bg-husrev-shadow dark:ring-white/[0.06]"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug text-husrev-ink dark:text-husrev-cream">
          {task.title}
        </span>
        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            className="shrink-0 rounded-full p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
          >
            <BiTrash size={12} />
          </button>
        )}
      </div>
      {task.description && (
        <p className="mb-2 text-xs text-gray-500 line-clamp-2 dark:text-gray-400">
          {task.description}
        </p>
      )}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider ${PRIORITY_COLOR[task.priority]}`}
          >
            {t(`kanban.priority.${task.priority}`)}
          </span>
          {task.dueAt && (
            <span className="font-mono text-[10px] text-gray-400">
              {formatDate(task.dueAt, { day: "2-digit", month: "short" })}
            </span>
          )}
        </div>
        {task.assigneeId && task.assigneeName && (
          <MemberAvatar name={task.assigneeName} size="sm" />
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  tasks,
  onMoveSameColumn,
  onDropOnColumn,
  onDelete,
  onDropEnd,
  onSelect,
  canEdit,
}: {
  status: TaskStatus;
  tasks: TaskResponse[];
  onMoveSameColumn: (status: TaskStatus, drag: number, hover: number) => void;
  onDropOnColumn: (item: DragItem, status: TaskStatus) => void;
  onDelete: (id: number) => void;
  onDropEnd: (didDrop: boolean) => void;
  onSelect: (task: TaskResponse) => void;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [{ isOver }, dropRef] = useDrop<DragItem, unknown, { isOver: boolean }>({
    accept: DRAG_TYPE,
    collect: (m) => ({ isOver: m.isOver({ shallow: true }) }),
    drop(item, monitor) {
      if (!canEdit) return;
      if (monitor.didDrop()) return;
      onDropOnColumn(item, status);
    },
  });

  return (
    <div
      ref={dropRef as unknown as React.Ref<HTMLDivElement>}
      className={`flex flex-col rounded-2xl border p-3 transition-colors duration-200 ${
        isOver
          ? "border-husrev-amber bg-husrev-amber/8 dark:border-husrev-amber dark:bg-husrev-amber/12"
          : "border-husrev-sand/80 bg-husrev-cream/40 dark:border-white/5 dark:bg-husrev-shadow/40"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
          <h4 className="husrev-kicker text-husrev-shadow dark:text-husrev-cream">
            {t(`kanban.status.${status}`)}
          </h4>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-mono tabular-nums text-husrev-shadow ring-1 ring-husrev-sand dark:bg-husrev-ink/60 dark:text-husrev-cream dark:ring-white/10">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 min-h-[140px]">
        {tasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            index={index}
            onMoveSameColumn={onMoveSameColumn}
            onDelete={onDelete}
            onDropEnd={onDropEnd}
            onSelect={onSelect}
            canEdit={canEdit}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-husrev-sand/70 py-6 text-center text-[11px] font-mono uppercase tracking-[0.16em] text-gray-400 dark:border-white/10">
            {t("kanban.dropHere")}
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({
  projectId,
  tasks,
  onSelect,
  canEdit,
}: {
  projectId: number;
  tasks: TaskResponse[];
  onSelect: (task: TaskResponse) => void;
  canEdit: boolean;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const updateTask = useUpdateTask();
  const reorderTasks = useReorderTasks();
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();

  const groupBy = (list: TaskResponse[]): Record<TaskStatus, TaskResponse[]> => {
    const out: Record<TaskStatus, TaskResponse[]> = {
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
      CANCELLED: [],
    };
    for (const t of list) out[t.status].push(t);
    for (const s of STATUSES) out[s].sort((a, b) => a.position - b.position);
    return out;
  };

  const [groups, setGroups] = useState(() => groupBy(tasks));
  const reorderedColumn = useRef<TaskStatus | null>(null);

  useEffect(() => {
    if (!reorderedColumn.current) {
      setGroups(groupBy(tasks));
    }
  }, [tasks]);

  const onMoveSameColumn = useCallback((status: TaskStatus, drag: number, hover: number) => {
    reorderedColumn.current = status;
    setGroups((prev) => {
      const next = { ...prev };
      const col = [...next[status]];
      const [item] = col.splice(drag, 1);
      col.splice(hover, 0, item);
      next[status] = col;
      return next;
    });
  }, []);

  const onDropOnColumn = useCallback(
    (item: DragItem, status: TaskStatus) => {
      if (!canEdit) return;
      if (item.fromStatus === status) return;
      const moved = groups[item.fromStatus][item.fromIndex];
      if (!moved) return;
      updateTask.mutate(
        {
          id: moved.id,
          projectId,
          body: {
            title: moved.title,
            description: moved.description,
            status,
            priority: moved.priority,
            dueAt: moved.dueAt,
          },
        },
        {
          onError: (err) => {
            const { title, message } = parseAxiosError(err);
            showAlert({ title, message, type: "error", position: "top-center" });
          },
        },
      );
    },
    [groups, updateTask, projectId, showAlert, canEdit],
  );

  const onDropEnd = useCallback(
    (didDrop: boolean) => {
      if (!canEdit) return;
      if (!didDrop || !reorderedColumn.current) {
        reorderedColumn.current = null;
        return;
      }
      const all = STATUSES.flatMap((s) => groups[s]);
      const items = all.map((t, i) => ({ id: t.id, position: i }));
      reorderedColumn.current = null;
      reorderTasks.mutate(
        { projectId, items },
        {
          onError: (err) => {
            const { title, message } = parseAxiosError(err);
            showAlert({ title, message, type: "error", position: "top-center" });
          },
        },
      );
    },
    [groups, reorderTasks, projectId, showAlert, canEdit],
  );

  const handleDelete = async (id: number) => {
    const task = STATUSES.flatMap((s) => groups[s]).find((tk) => tk.id === id);
    try {
      await deleteTask.mutateAsync({ id, projectId });
      showUndoToast({
        message: t("projects.undo.taskDeleted", { title: task?.title ?? "" }),
        onUndo: () => restoreTask.mutateAsync({ id, projectId }),
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STATUSES.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          tasks={groups[status]}
          onMoveSameColumn={onMoveSameColumn}
          onDropOnColumn={onDropOnColumn}
          onDelete={handleDelete}
          onDropEnd={onDropEnd}
          onSelect={onSelect}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
