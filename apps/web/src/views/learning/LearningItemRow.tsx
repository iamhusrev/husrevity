"use client";

import { useTranslation } from "react-i18next";
import { BiLinkExternal, BiX } from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";
import { MdDragIndicator } from "react-icons/md";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { LearningItemResponse } from "@/types/learning/learning";
import { formatDateTime } from "@/utils/i18n-date";
import { linkLabel, toHref } from "@/utils/linkify";
import LinkifiedText from "@/components/ui/LinkifiedText";
import { itemDndId } from "./learning-dnd";

/**
 * One checklist row. It lives in its own module on purpose: declared inside TopicCard's render it
 * would be a new component type on every render, remounting the row and dropping the drag state.
 */
export default function LearningItemRow({
  item,
  containerId,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: LearningItemResponse;
  /** The list the row belongs to, so a drop can tell "reorder" from "move to another list". */
  containerId: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemDndId(item.id), data: { type: "item", containerId } });

  // Hover-only affordances are unreachable on touch screens, so the delete control is hidden
  // behind hover only on fine-pointer devices and stays (quietly) visible everywhere else.
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group/item -mx-1.5 flex min-h-11 items-start gap-1 rounded-xl px-1.5 py-1 transition-colors hover:bg-husrev-cream/60 focus-within:bg-husrev-cream/60 dark:hover:bg-white/[0.04] dark:focus-within:bg-white/[0.04] ${
        isDragging ? "opacity-40 ring-2 ring-dashed ring-husrev-amber/70" : ""
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={t("learning.dnd.dragItem", "Drag to reorder item")}
        className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-gray-400 transition hover:text-husrev-ember focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber active:cursor-grabbing dark:text-gray-500"
      >
        <MdDragIndicator size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:text-brand-500 dark:text-gray-400"
        aria-label={
          item.completedAt ? t("learning.toggle.incomplete") : t("learning.toggle.complete")
        }
      >
        {item.completedAt ? (
          <BsCheckCircleFill size={20} className="text-brand-500" />
        ) : (
          <BsCircle size={20} />
        )}
      </button>
      {/* The text opens the editor; the link chip sits outside that button so it can be a real
          anchor (an <a> inside a <button> is invalid and the click would open the editor). */}
      <div className="min-w-0 flex-1 py-1.5">
        <button
          type="button"
          onClick={onEdit}
          className={`block w-full text-left text-sm leading-6 ${
            item.completedAt
              ? "text-gray-400 line-through decoration-gray-300 dark:text-gray-500 dark:decoration-gray-600"
              : "text-gray-800 dark:text-white/90"
          }`}
        >
          <span className="block truncate">{item.text}</span>
        </button>
        {(item.url || item.estimatedMinutes !== null || item.reviewAt) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {item.url && (
              <a
                href={toHref(item.url)}
                target="_blank"
                rel="noopener noreferrer"
                onPointerDown={(e) => e.stopPropagation()}
                title={item.url}
                className="inline-flex min-w-0 items-center gap-1 rounded text-brand-600 underline decoration-brand-500/40 underline-offset-2 transition hover:text-brand-700 hover:decoration-brand-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:text-brand-400 dark:hover:text-brand-300"
              >
                <BiLinkExternal aria-hidden="true" className="shrink-0" />
                <span className="truncate">{linkLabel(item.url)}</span>
              </a>
            )}
            {item.estimatedMinutes !== null && <span>◷ {item.estimatedMinutes} dk</span>}
            {item.reviewAt && (
              <span>
                {formatDateTime(item.reviewAt, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        )}
        {item.notes && (
          <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs leading-5 text-gray-500 dark:text-gray-400">
            <LinkifiedText text={item.notes} />
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={t("common.delete", "Delete")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition dark:text-gray-400 hover:bg-error-50 hover:text-error-500 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/item:opacity-100 pointer-fine:group-focus-within/item:opacity-100 dark:hover:bg-error-500/10"
      >
        <BiX className="h-4 w-4" />
      </button>
    </li>
  );
}
