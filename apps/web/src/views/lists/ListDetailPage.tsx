"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  useCreateTodoListItem,
  useDeleteTodoListItem,
  useReorderTodoListItems,
  useToggleTodoListItem,
  useTodoList,
  useTodoListItems,
} from "@/hooks/useLists";
import { TodoListItemResponse } from "@/types/list/list";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatDateTime } from "@/utils/i18n-date";
import { BiPlus, BiTrash, BiMenu, BiArrowBack } from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";

const DRAG_TYPE = "TODO_LIST_ITEM";

interface DragItem {
  index: number;
  id: number;
}

function ItemRow({
  item,
  index,
  listId,
  moveItem,
  onDrop,
}: {
  item: TodoListItemResponse;
  index: number;
  listId: number;
  moveItem: (drag: number, hover: number) => void;
  onDrop: () => void;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const toggle = useToggleTodoListItem();
  const remove = useDeleteTodoListItem();
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { index, id: item.id },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop();
    },
  });

  const [, dropRef] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(d) {
      if (d.index === index) return;
      moveItem(d.index, index);
      d.index = index;
    },
    drop: () => ({}),
  });

  dragRef(dropRef(ref));

  const handleToggle = async () => {
    try {
      await toggle.mutateAsync({ id: item.id, listId });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync({ id: item.id, listId });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0.4 : 1,
        transform: isDragging ? "scale(0.99)" : undefined,
      }}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-husrev-cream/60 dark:hover:bg-white/[0.04]"
    >
      <span className="cursor-grab text-gray-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing dark:text-gray-600">
        <BiMenu size={14} className="rotate-90" />
      </span>
      <button
        type="button"
        onClick={handleToggle}
        className="shrink-0 text-gray-400 transition hover:text-brand-500"
        aria-label={item.done ? t("lists.toggle.incomplete") : t("lists.toggle.complete")}
      >
        {item.done ? (
          <BsCheckCircleFill size={18} className="text-brand-500" />
        ) : (
          <BsCircle size={18} />
        )}
      </button>
      <div className="flex flex-1 flex-col min-w-0">
        <span
          className={`truncate text-sm ${
            item.done
              ? "line-through text-gray-400 dark:text-gray-500"
              : "text-gray-800 dark:text-white/90"
          }`}
        >
          {item.text}
        </span>
        {item.dueAt && (
          <span className="text-xs text-gray-400">
            {formatDateTime(item.dueAt, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleDelete}
        className="rounded-full p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
        aria-label={t("lists.deleteAria")}
      >
        <BiTrash size={14} />
      </button>
    </div>
  );
}

export default function ListDetailPage({
  id,
  embedded,
}: {
  id: number;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const { data: list } = useTodoList(id);
  const { data: items = [], isLoading } = useTodoListItems(id);
  const create = useCreateTodoListItem();
  const reorder = useReorderTodoListItems();

  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sorted = [...items].sort((a, b) => a.position - b.position);
  const [ordered, setOrdered] = useState<TodoListItemResponse[]>(sorted);
  const orderedRef = useRef<TodoListItemResponse[]>(sorted);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) {
      const next = [...items].sort((a, b) => a.position - b.position);
      setOrdered(next);
      orderedRef.current = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const moveItem = useCallback((drag: number, hover: number) => {
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
    const payload = orderedRef.current.map((it, i) => ({
      id: it.id,
      position: i,
    }));
    reorder.mutate({ listId: id, items: payload });
  }, [reorder, id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ listId: id, body: { text: trimmed } });
      setText("");
      inputRef.current?.focus();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  if (id <= 0) {
    return <p className="p-6 text-gray-500">{t("lists.invalid")}</p>;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6">
        {!embedded && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/lists")}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label={t("common.back")}
            >
              <BiArrowBack size={18} />
            </button>
            <PageBreadcrumb pageTitle={list?.name ?? t("lists.title")} />
          </div>
        )}

        <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <form onSubmit={handleAdd} className="mb-5 flex gap-2 items-stretch">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("lists.newItemPlaceholder")}
              className="husrev-input flex-1"
            />
            <button
              type="submit"
              disabled={!text.trim() || create.isPending}
              className="husrev-btn shrink-0 px-4"
              aria-label={t("lists.addAria")}
            >
              <BiPlus size={18} />
            </button>
          </form>

          {isLoading ? (
            <p className="py-4 text-center text-sm text-gray-400">{t("common.loading")}</p>
          ) : ordered.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{t("lists.noItems")}</p>
          ) : (
            <div className="space-y-0.5">
              {ordered.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  listId={id}
                  moveItem={moveItem}
                  onDrop={onDrop}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DndProvider>
  );
}
