"use client";

import { useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useTranslation } from "react-i18next";
import { BiChevronDown, BiChevronUp, BiMenu } from "react-icons/bi";
import type { NavItemId, NavSectionId } from "@/types/user/user";
import { NAV_REGISTRY } from "@/utils/nav-items";
import { isSameNavOrder, moveNavItem, stepNavItem, type NavOrder } from "@/utils/nav-order";

const DND_TYPE = "NAV_ITEM";

type DragItem = { id: NavItemId };

function EditRow({
  id,
  section,
  index,
  onMove,
  onStep,
}: {
  id: NavItemId;
  section: NavSectionId;
  index: number;
  onMove: (id: NavItemId, section: NavSectionId, index: number) => void;
  onStep: (id: NavItemId, dir: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLLIElement>(null);
  const { icon: Icon, key } = NAV_REGISTRY[id];

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_TYPE,
    item: { id } satisfies DragItem,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });
  const [, drop] = useDrop<DragItem>({
    accept: DND_TYPE,
    hover: (dragged) => {
      if (dragged.id !== id) onMove(dragged.id, section, index);
    },
  });
  drop(preview(ref));

  return (
    <li
      ref={ref}
      className={`menu-item menu-item-inactive items-center gap-2 ${isDragging ? "opacity-40" : ""}`}
    >
      <span
        ref={(el) => {
          drag(el);
        }}
        title={t("nav.edit.drag")}
        aria-label={t("nav.edit.drag")}
        className="cursor-grab text-gray-400 active:cursor-grabbing"
      >
        <BiMenu size={20} />
      </span>
      <Icon size={20} />
      <span className="menu-item-text flex-1">{t(key)}</span>
      <button
        type="button"
        aria-label={`${t("nav.edit.moveUp")}: ${t(key)}`}
        onClick={() => onStep(id, -1)}
        className="rounded p-0.5 text-gray-400 hover:text-husrev-ember"
      >
        <BiChevronUp size={18} />
      </button>
      <button
        type="button"
        aria-label={`${t("nav.edit.moveDown")}: ${t(key)}`}
        onClick={() => onStep(id, 1)}
        className="rounded p-0.5 text-gray-400 hover:text-husrev-ember"
      >
        <BiChevronDown size={18} />
      </button>
    </li>
  );
}

function EditSection({
  section,
  label,
  ids,
  onMove,
  onStep,
}: {
  section: NavSectionId;
  label: string;
  ids: NavItemId[];
  onMove: (id: NavItemId, section: NavSectionId, index: number) => void;
  onStep: (id: NavItemId, dir: -1 | 1) => void;
}) {
  // Lets an item be dropped into a section that is currently empty.
  const [, drop] = useDrop<DragItem>({
    accept: DND_TYPE,
    hover: (dragged) => {
      if (ids.length === 0) onMove(dragged.id, section, 0);
    },
  });

  return (
    <div>
      <div className="px-3 pt-4 pb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
        {label}
      </div>
      <ul
        ref={(el) => {
          drop(el);
        }}
        className="flex min-h-8 flex-col gap-1"
      >
        {ids.map((id, index) => (
          <EditRow
            key={id}
            id={id}
            section={section}
            index={index}
            onMove={onMove}
            onStep={onStep}
          />
        ))}
      </ul>
    </div>
  );
}

export interface NavEditorProps {
  order: NavOrder;
  saving: boolean;
  error: boolean;
  onSave: (order: NavOrder) => void;
  onReset: () => void;
  onCancel: () => void;
}

/** Drag-and-drop (and button) editor for the reorderable sidebar sections. Must sit inside a DndProvider. */
export default function NavEditor({
  order,
  saving,
  error,
  onSave,
  onReset,
  onCancel,
}: NavEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<NavOrder>(order);

  const handleMove = (id: NavItemId, section: NavSectionId, index: number) =>
    setDraft((prev) => moveNavItem(prev, id, section, index));
  const handleStep = (id: NavItemId, dir: -1 | 1) => setDraft((prev) => stepNavItem(prev, id, dir));

  const handleDone = () => (isSameNavOrder(draft, order) ? onCancel() : onSave(draft));

  return (
    <div>
      <EditSection
        section="core"
        label={t("nav.section.core")}
        ids={draft.core}
        onMove={handleMove}
        onStep={handleStep}
      />
      <EditSection
        section="daily"
        label={t("nav.section.daily")}
        ids={draft.daily}
        onMove={handleMove}
        onStep={handleStep}
      />

      {error && (
        <p role="alert" className="px-3 pt-2 text-xs text-red-600">
          {t("nav.edit.error")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        <button
          type="button"
          disabled={saving}
          onClick={handleDone}
          className="rounded-lg bg-husrev-ink px-3 py-1.5 text-xs font-medium text-husrev-cream disabled:opacity-50 dark:bg-husrev-cream dark:text-husrev-ink"
        >
          {t("nav.edit.done")}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:text-husrev-ink dark:hover:text-husrev-cream"
        >
          {t("nav.edit.cancel")}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onReset}
          className="ml-auto text-xs text-gray-400 underline hover:text-husrev-ember"
        >
          {t("nav.edit.reset")}
        </button>
      </div>
    </div>
  );
}
