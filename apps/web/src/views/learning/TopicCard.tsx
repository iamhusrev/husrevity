"use client";

import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BiChevronDown,
  BiDotsVerticalRounded,
  BiMicrophone,
  BiPencil,
  BiPlus,
} from "react-icons/bi";
import { MdDragIndicator } from "react-icons/md";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import DictateQuickAddModal from "@/components/ai/DictateQuickAddModal";
import { Dropdown } from "@/components/dropdown/Dropdown";
import { DropdownItem } from "@/components/dropdown/DropdownItem";
import {
  useCreateLearningItem,
  useDeleteLearningItem,
  useMoveLearningItem,
  useReorderLearningItems,
  useReorderLearningSubtopics,
  useToggleLearningItem,
} from "@/hooks/useLearning";
import { alertStore } from "@/stores/alert-store";
import {
  LearningItemResponse,
  LearningSubtopicResponse,
  LearningTopicResponse,
} from "@/types/learning/learning";
import { parseAxiosError } from "@/utils/handleError";
import {
  BodyDrop,
  bodyCollision,
  directContainerId,
  itemDndId,
  parseDndId,
  resolveBodyDrop,
  subtopicContainerId,
  subtopicDndId,
  topicDndId,
} from "./learning-dnd";
import { Edge } from "./learning-order";
import LearningItemRow from "./LearningItemRow";
import { useLearningSensors } from "./useLearningSensors";
import LinkifiedText from "@/components/ui/LinkifiedText";

/** A drop zone around one item list; it also lights up while an item hovers an empty list. */
function ItemList({
  containerId,
  itemIds,
  empty,
  className = "",
  children,
}: {
  containerId: string;
  itemIds: string[];
  empty?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId, data: { type: "container" } });
  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "rounded-xl ring-2 ring-dashed ring-husrev-amber/60" : ""}`}
    >
      <SortableContext items={itemIds.map(itemDndId)} strategy={verticalListSortingStrategy}>
        {itemIds.length > 0 ? <ul className="space-y-0.5">{children}</ul> : empty}
      </SortableContext>
    </div>
  );
}

/** A subtopic section that can be dragged by the grip it hands to `children`. */
function SortableSection({
  subtopicId,
  dragLabel,
  children,
}: {
  subtopicId: string;
  dragLabel: string;
  children: (grip: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtopicDndId(subtopicId), data: { type: "subtopic" } });
  const grip = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={dragLabel}
      className="mt-1 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-gray-400 transition hover:text-husrev-ember focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber active:cursor-grabbing dark:text-gray-500"
    >
      <MdDragIndicator size={18} aria-hidden="true" />
    </button>
  );
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-xl bg-husrev-cream/40 px-3 pb-2 pt-3 ring-1 ring-husrev-sand/60 sm:px-4 dark:bg-white/[0.03] dark:ring-white/[0.06] ${
        isDragging ? "opacity-40 ring-2 ring-dashed ring-husrev-amber/70" : ""
      }`}
    >
      {children(grip)}
    </section>
  );
}

export default function TopicCard({
  topic,
  index,
  isOpen,
  yearBadge,
  onToggle,
  onEdit,
  onEditItem,
  onOpenSubtopicModal,
  onMoveToEdge,
  showAlert,
}: {
  topic: LearningTopicResponse;
  index: number;
  isOpen: boolean;
  /** Shown in the card summary while the list mixes years (the All tab); null hides it. */
  yearBadge: number | null;
  onToggle: () => void;
  onEdit: () => void;
  onEditItem: (editing: {
    item: LearningItemResponse;
    subtopics: LearningSubtopicResponse[];
  }) => void;
  onOpenSubtopicModal: (subtopic: LearningSubtopicResponse | null) => void;
  /** One-click priority: put this topic first or last in the visible list. */
  onMoveToEdge: (edge: Edge) => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const create = useCreateLearningItem();
  const remove = useDeleteLearningItem();
  const toggle = useToggleLearningItem();
  const [text, setText] = useState("");
  const [subtopicTexts, setSubtopicTexts] = useState<Record<string, string>>({});
  const [showDictateModal, setShowDictateModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeBodyId, setActiveBodyId] = useState<string | null>(null);
  const sensors = useLearningSensors();
  const reportReorderError = (err: unknown) => {
    const { title, message } = parseAxiosError(err);
    showAlert({ title, message, type: "error", position: "top-center" });
  };
  const reorderSubtopics = useReorderLearningSubtopics({ onError: reportReorderError });
  const reorderItems = useReorderLearningItems({ onError: reportReorderError });
  const moveItem = useMoveLearningItem({ onError: reportReorderError });
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: topicDndId(topic.id), data: { type: "topic" } });
  const pct = topic.itemCount ? Math.round((topic.completedCount / topic.itemCount) * 100) : 0;
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };
  const handleDictateConfirm = async (items: string[]) => {
    for (const item of items) {
      await run(() => create.mutateAsync({ topicId: topic.id, body: { text: item } }));
    }
  };
  const applyBodyDrop = (drop: BodyDrop) => {
    if (drop.type === "subtopics")
      reorderSubtopics.mutate({ topicId: topic.id, orderedIds: drop.orderedIds });
    else if (drop.type === "items")
      reorderItems.mutate({
        topicId: topic.id,
        subtopicId: drop.subtopicId ?? undefined,
        orderedIds: drop.orderedIds,
      });
    else moveItem.mutate({ itemId: drop.itemId, subtopicId: drop.subtopicId, index: drop.index });
  };
  const handleBodyDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveBodyId(null);
    if (!over) return;
    const drop = resolveBodyDrop(topic, String(active.id), String(over.id));
    if (drop) applyBodyDrop(drop);
  };
  const activeBodyLabel = (() => {
    const parsed = activeBodyId ? parseDndId(activeBodyId) : null;
    if (parsed?.kind === "subtopic") return topic.subtopics.find((x) => x.id === parsed.id)?.title;
    if (parsed?.kind === "item")
      return [...topic.items, ...topic.subtopics.flatMap((x) => x.items)].find(
        (x) => x.id === parsed.id,
      )?.text;
    return undefined;
  })();
  const renderItem = (item: LearningItemResponse, containerId: string) => (
    <LearningItemRow
      key={item.id}
      item={item}
      containerId={containerId}
      onToggle={() => void run(() => toggle.mutateAsync(item.id))}
      onEdit={() => onEditItem({ item, subtopics: topic.subtopics })}
      onDelete={() => void run(() => remove.mutateAsync(item.id))}
    />
  );
  // A plain render helper, not a component: declaring it as a component inside the render would
  // remount the input on every keystroke and drop focus.
  const renderAddRow = ({
    value,
    onChange,
    onSubmit,
    placeholder,
    addLabel,
    trailing,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    placeholder: string;
    addLabel: string;
    trailing?: React.ReactNode;
  }) => {
    const canSubmit = Boolean(value.trim()) && !create.isPending;
    return (
      <div className="-mx-1.5 flex items-center gap-2 rounded-xl px-1.5 transition-colors focus-within:bg-husrev-cream/60 focus-within:ring-2 focus-within:ring-husrev-amber/40 dark:focus-within:bg-white/[0.04]">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          aria-label={addLabel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition dark:text-gray-400 enabled:text-husrev-ember enabled:hover:bg-husrev-amber/10 disabled:opacity-60 dark:enabled:text-husrev-amber"
        >
          <BiPlus className="h-5 w-5" />
        </button>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
          maxLength={300}
          placeholder={placeholder}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm text-husrev-ink outline-none placeholder:text-gray-500 dark:text-husrev-cream dark:placeholder:text-gray-400"
        />
        {trailing}
      </div>
    );
  };
  const submitTopicItem = () =>
    void run(async () => {
      await create.mutateAsync({ topicId: topic.id, body: { text: text.trim() } });
      setText("");
    });
  const hasDirectItems = topic.items.length > 0;
  const hasSubtopics = topic.subtopics.length > 0;
  const iconButtonClass =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition dark:text-gray-400 hover:bg-husrev-cream/70 hover:text-husrev-ember dark:hover:bg-white/[0.05] dark:hover:text-husrev-amber";
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative flex flex-col rounded-2xl bg-white shadow-card-warm ring-1 ring-husrev-sand/90 dark:bg-husrev-shadow dark:ring-white/[0.06] ${
        isOpen ? "sm:col-span-2 xl:col-span-3" : ""
      } ${isDragging ? "z-10 opacity-40 ring-2 ring-dashed ring-husrev-amber/70" : ""}`}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl bg-husrev-amber"
        aria-hidden="true"
      />
      {/* Collapsed card: title row (the open/close toggle), a two-line description, progress and
          a summary line. Editing is only reachable through the pencil. */}
      <div className="px-3 pb-3.5 pt-2.5 sm:px-5 sm:pb-4 sm:pt-3">
        <div className="flex items-start gap-1 sm:gap-2">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`${t("learning.dnd.dragTopic", "Drag to reorder topic")}: ${topic.title}`}
            className={`${iconButtonClass} mt-0.5 -ml-1 w-7 cursor-grab touch-none active:cursor-grabbing`}
          >
            <MdDragIndicator size={20} aria-hidden="true" />
          </button>
          <h3 className="min-w-0 flex-1 text-[17px] font-semibold leading-6 tracking-tight text-husrev-ink sm:text-lg dark:text-husrev-cream">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              aria-controls={`topic-body-${topic.id}`}
              aria-label={topic.title}
              className="-ml-1.5 flex w-full items-start gap-1.5 rounded-xl py-1.5 pl-1.5 pr-1 text-left transition hover:bg-husrev-cream/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber dark:hover:bg-white/[0.04]"
            >
              <BiChevronDown
                aria-hidden="true"
                className={`mt-0.5 h-5 w-5 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${isOpen ? "" : "-rotate-90"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="mr-2 text-xs font-medium tabular-nums text-husrev-ink/50 dark:text-husrev-cream/50">
                  {index + 1}.
                </span>
                <span className={isOpen ? "" : "line-clamp-2"}>{topic.title}</span>
              </span>
            </button>
          </h3>
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("common.edit", "Edit")}
            className={`${iconButtonClass} mt-0.5`}
          >
            <BiPencil className="h-4 w-4" />
          </button>
          <div className="relative mt-0.5">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`${t("learning.moreActions", "More actions")}: ${topic.title}`}
              className={`dropdown-toggle ${iconButtonClass}`}
            >
              <BiDotsVerticalRounded className="h-5 w-5" />
            </button>
            <Dropdown isOpen={menuOpen} onClose={() => setMenuOpen(false)} className="w-44 p-1">
              <DropdownItem
                onClick={() => onMoveToEdge("top")}
                onItemClick={() => setMenuOpen(false)}
                baseClassName="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-husrev-cream/70 dark:text-gray-200 dark:hover:bg-white/[0.05]"
              >
                {t("learning.moveToTop", "Move to top")}
              </DropdownItem>
              <DropdownItem
                onClick={() => onMoveToEdge("bottom")}
                onItemClick={() => setMenuOpen(false)}
                baseClassName="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-husrev-cream/70 dark:text-gray-200 dark:hover:bg-white/[0.05]"
              >
                {t("learning.moveToBottom", "Move to bottom")}
              </DropdownItem>
            </Dropdown>
          </div>
        </div>
        {topic.description && (
          <p
            className={`mt-0.5 pl-6 text-sm leading-6 text-gray-500 dark:text-gray-400 ${isOpen ? "" : "line-clamp-2"}`}
          >
            <LinkifiedText text={topic.description} />
          </p>
        )}
        <div
          className="ml-6 mt-2.5 h-1 overflow-hidden rounded-full bg-husrev-sand/50 dark:bg-white/[0.06]"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-husrev-amber transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 pl-6 text-xs text-gray-500 dark:text-gray-400">
          <span className="min-w-0 truncate tabular-nums">
            {t("learning.progress", { done: topic.completedCount, total: topic.itemCount })}
            {hasSubtopics && (
              <>
                {" · "}
                {t("learning.subtopicCount", { count: topic.subtopics.length })}
              </>
            )}
          </span>
          {yearBadge !== null && (
            <span className="shrink-0 rounded-full bg-husrev-sand/50 px-2 py-0.5 font-medium tabular-nums text-husrev-ink/70 dark:bg-white/[0.06] dark:text-husrev-cream/70">
              <span className="sr-only">{t("learning.field.year", "Year")}: </span>
              {yearBadge}
            </span>
          )}
        </div>
      </div>
      {isOpen && (
        <div
          id={`topic-body-${topic.id}`}
          className="border-t border-husrev-sand/70 px-4 py-4 sm:px-5 sm:py-5 dark:border-white/[0.06]"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={bodyCollision}
            onDragStart={({ active }: DragStartEvent) => setActiveBodyId(String(active.id))}
            onDragEnd={handleBodyDragEnd}
            onDragCancel={() => setActiveBodyId(null)}
            accessibility={{
              screenReaderInstructions: {
                draggable: t(
                  "learning.dnd.instructions",
                  "To pick up an item, press space or enter. Use the arrow keys to move it, space or enter to drop it, escape to cancel.",
                ),
              },
            }}
          >
            {/* Direct items first, with their own quiet add row, so they read as one group. */}
            {!hasDirectItems && !hasSubtopics && (
              <p className="mb-2 px-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {t("learning.emptyTopic", "Nothing here yet. Add the first item below.")}
              </p>
            )}
            {(hasDirectItems || hasSubtopics) && (
              <ItemList
                containerId={directContainerId(topic.id)}
                itemIds={topic.items.map((i) => i.id)}
                className={hasDirectItems ? "" : "min-h-2"}
              >
                {topic.items.map((item) => renderItem(item, directContainerId(topic.id)))}
              </ItemList>
            )}
            <div className={hasDirectItems ? "mt-1" : ""}>
              {renderAddRow({
                value: text,
                onChange: setText,
                onSubmit: submitTopicItem,
                placeholder: t("learning.addItem", "Add item…"),
                addLabel: `${t("learning.addItem", "Add item…")} (${topic.title})`,
                trailing: (
                  <button
                    type="button"
                    onClick={() => setShowDictateModal(true)}
                    title={t("dictate.triggerTooltip")}
                    aria-label={t("dictate.triggerTooltip")}
                    className={iconButtonClass}
                  >
                    <BiMicrophone className="h-4 w-4" />
                  </button>
                ),
              })}
            </div>
            {hasSubtopics && (
              <SortableContext
                items={topic.subtopics.map((x) => subtopicDndId(x.id))}
                strategy={verticalListSortingStrategy}
              >
                <div className="mt-5 space-y-3">
                  {topic.subtopics.map((subtopic, si) => {
                    const subtopicPct = subtopic.itemCount
                      ? Math.round((subtopic.completedCount / subtopic.itemCount) * 100)
                      : 0;
                    const subtopicText = subtopicTexts[subtopic.id] ?? "";
                    const submitSubtopicItem = () =>
                      void run(async () => {
                        await create.mutateAsync({
                          topicId: topic.id,
                          body: { text: subtopicText.trim(), subtopicId: subtopic.id },
                        });
                        setSubtopicTexts((current) => ({ ...current, [subtopic.id]: "" }));
                      });
                    return (
                      <SortableSection
                        key={subtopic.id}
                        subtopicId={subtopic.id}
                        dragLabel={`${t("learning.dnd.dragSubtopic", "Drag to reorder subtopic")}: ${subtopic.title}`}
                      >
                        {(grip) => (
                          <>
                            <div className="flex items-start gap-2">
                              {grip}
                              <button
                                type="button"
                                onClick={() => onOpenSubtopicModal(subtopic)}
                                className="min-w-0 flex-1 py-1.5 text-left"
                              >
                                <h4 className="flex items-baseline gap-2 text-sm font-semibold leading-6 text-husrev-ink/85 dark:text-husrev-cream/85">
                                  <span className="shrink-0 text-xs font-medium text-husrev-ink/50 dark:text-husrev-cream/50">
                                    {String.fromCharCode(97 + si)}.
                                  </span>
                                  <span className="min-w-0">{subtopic.title}</span>
                                </h4>
                                {subtopic.description && (
                                  <p className="mt-0.5 text-[13px] leading-5 text-gray-500 dark:text-gray-400">
                                    {subtopic.description}
                                  </p>
                                )}
                              </button>
                              <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                                <span className="whitespace-nowrap px-1.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                  {t("learning.progress", {
                                    done: subtopic.completedCount,
                                    total: subtopic.itemCount,
                                  })}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onOpenSubtopicModal(subtopic)}
                                  aria-label={t("common.edit", "Edit")}
                                  className={iconButtonClass}
                                >
                                  <BiPencil className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div
                              className="mt-1.5 h-1 overflow-hidden rounded-full bg-husrev-sand/60 dark:bg-white/[0.06]"
                              aria-hidden="true"
                            >
                              <div
                                className="h-full rounded-full bg-husrev-amber transition-all"
                                style={{ width: `${subtopicPct}%` }}
                              />
                            </div>
                            <ItemList
                              containerId={subtopicContainerId(subtopic.id)}
                              itemIds={subtopic.items.map((i) => i.id)}
                              className="mt-2"
                              empty={
                                <p className="px-1.5 text-[13px] leading-6 text-gray-500 dark:text-gray-400">
                                  {t("learning.emptySubtopic", "No items yet.")}
                                </p>
                              }
                            >
                              {subtopic.items.map((item) =>
                                renderItem(item, subtopicContainerId(subtopic.id)),
                              )}
                            </ItemList>
                            <div className="mt-1">
                              {renderAddRow({
                                value: subtopicText,
                                onChange: (value) =>
                                  setSubtopicTexts((current) => ({
                                    ...current,
                                    [subtopic.id]: value,
                                  })),
                                onSubmit: submitSubtopicItem,
                                placeholder: t("learning.addSubtopicItem", "Add item…"),
                                addLabel: `${t("learning.addSubtopicItem", "Add item…")} (${subtopic.title})`,
                              })}
                            </div>
                          </>
                        )}
                      </SortableSection>
                    );
                  })}
                </div>
              </SortableContext>
            )}
            <button
              type="button"
              onClick={() => onOpenSubtopicModal(null)}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-gray-500 transition hover:bg-husrev-cream/70 hover:text-husrev-ember dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-husrev-amber"
            >
              <BiPlus className="h-4 w-4" />
              {t("learning.newSubtopic", "New subtopic")}
            </button>
            <DragOverlay>
              {activeBodyLabel && (
                <div className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-husrev-ink shadow-card-warm ring-2 ring-husrev-amber dark:bg-husrev-shadow dark:text-husrev-cream">
                  {activeBodyLabel}
                </div>
              )}
            </DragOverlay>
          </DndContext>
          <DictateQuickAddModal
            isOpen={showDictateModal}
            onClose={() => setShowDictateModal(false)}
            title={t("dictate.title")}
            onConfirm={handleDictateConfirm}
          />
        </div>
      )}
    </article>
  );
}
