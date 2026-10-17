"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiChevronDown, BiLinkExternal, BiMicrophone, BiPencil, BiPlus, BiX } from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";
import DictateQuickAddModal from "@/components/ai/DictateQuickAddModal";
import {
  useCreateLearningItem,
  useDeleteLearningItem,
  useToggleLearningItem,
} from "@/hooks/useLearning";
import { alertStore } from "@/stores/alert-store";
import {
  LearningItemResponse,
  LearningSubtopicResponse,
  LearningTopicResponse,
} from "@/types/learning/learning";
import { parseAxiosError } from "@/utils/handleError";
import { formatDateTime } from "@/utils/i18n-date";

export default function TopicCard({
  topic,
  index,
  isOpen,
  yearBadge,
  onToggle,
  onEdit,
  onEditItem,
  onOpenSubtopicModal,
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
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const create = useCreateLearningItem();
  const remove = useDeleteLearningItem();
  const toggle = useToggleLearningItem();
  const [text, setText] = useState("");
  const [subtopicTexts, setSubtopicTexts] = useState<Record<string, string>>({});
  const [showDictateModal, setShowDictateModal] = useState(false);
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
  // Hover-only affordances are unreachable on touch screens, so the delete control is hidden
  // behind hover only on fine-pointer devices and stays (quietly) visible everywhere else.
  const ItemRow = ({ item }: { item: LearningItemResponse }) => (
    <li className="group/item -mx-1.5 flex min-h-11 items-start gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-husrev-cream/60 focus-within:bg-husrev-cream/60 dark:hover:bg-white/[0.04] dark:focus-within:bg-white/[0.04]">
      <button
        type="button"
        onClick={() => void run(() => toggle.mutateAsync(item.id))}
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
      <button
        type="button"
        onClick={() => onEditItem({ item, subtopics: topic.subtopics })}
        className={`min-w-0 flex-1 py-1.5 text-left text-sm leading-6 ${
          item.completedAt
            ? "text-gray-400 line-through decoration-gray-300 dark:text-gray-500 dark:decoration-gray-600"
            : "text-gray-800 dark:text-white/90"
        }`}
      >
        <span className="block truncate">{item.text}</span>
        {(item.url || item.estimatedMinutes !== null || item.reviewAt) && (
          <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs leading-5 text-gray-500 no-underline dark:text-gray-400">
            {item.url && (
              <span className="inline-flex items-center gap-1">
                <BiLinkExternal />
                {new URL(item.url).hostname || "Link"}
              </span>
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
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => void run(() => remove.mutateAsync(item.id))}
        aria-label={t("common.delete", "Delete")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition dark:text-gray-400 hover:bg-error-50 hover:text-error-500 focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover/item:opacity-100 pointer-fine:group-focus-within/item:opacity-100 dark:hover:bg-error-500/10"
      >
        <BiX className="h-4 w-4" />
      </button>
    </li>
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
      className={`relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-card-warm ring-1 ring-husrev-sand/90 dark:bg-husrev-shadow dark:ring-white/[0.06] ${
        isOpen ? "sm:col-span-2 xl:col-span-3" : ""
      }`}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-husrev-amber" aria-hidden="true" />
      {/* Collapsed card: title row (the open/close toggle), a two-line description, progress and
          a summary line. Editing is only reachable through the pencil. */}
      <div className="px-3 pb-3.5 pt-2.5 sm:px-5 sm:pb-4 sm:pt-3">
        <div className="flex items-start gap-1 sm:gap-2">
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
        </div>
        {topic.description && (
          <p
            className={`mt-0.5 pl-6 text-sm leading-6 text-gray-500 dark:text-gray-400 ${isOpen ? "" : "line-clamp-2"}`}
          >
            {topic.description}
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
          {/* Direct items first, with their own quiet add row, so they read as one group. */}
          {!hasDirectItems && !hasSubtopics && (
            <p className="mb-2 px-1.5 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {t("learning.emptyTopic", "Nothing here yet. Add the first item below.")}
            </p>
          )}
          {hasDirectItems && (
            <ul className="space-y-0.5">
              {topic.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
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
                  <section
                    key={subtopic.id}
                    className="rounded-xl bg-husrev-cream/40 px-3 pb-2 pt-3 ring-1 ring-husrev-sand/60 sm:px-4 dark:bg-white/[0.03] dark:ring-white/[0.06]"
                  >
                    <div className="flex items-start gap-2">
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
                    {subtopic.items.length > 0 ? (
                      <ul className="mt-2 space-y-0.5">
                        {subtopic.items.map((item) => (
                          <ItemRow key={item.id} item={item} />
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 px-1.5 text-[13px] leading-6 text-gray-500 dark:text-gray-400">
                        {t("learning.emptySubtopic", "No items yet.")}
                      </p>
                    )}
                    <div className="mt-1">
                      {renderAddRow({
                        value: subtopicText,
                        onChange: (value) =>
                          setSubtopicTexts((current) => ({ ...current, [subtopic.id]: value })),
                        onSubmit: submitSubtopicItem,
                        placeholder: t("learning.addSubtopicItem", "Add item…"),
                        addLabel: `${t("learning.addSubtopicItem", "Add item…")} (${subtopic.title})`,
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => onOpenSubtopicModal(null)}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium text-gray-500 transition hover:bg-husrev-cream/70 hover:text-husrev-ember dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-husrev-amber"
          >
            <BiPlus className="h-4 w-4" />
            {t("learning.newSubtopic", "New subtopic")}
          </button>
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
