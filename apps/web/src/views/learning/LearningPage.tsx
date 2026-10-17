"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BiChevronDown,
  BiLinkExternal,
  BiMicrophone,
  BiPencil,
  BiPlus,
  BiTrash,
  BiX,
} from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";
import DictateQuickAddModal from "@/components/ai/DictateQuickAddModal";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import DateTimePicker from "@/components/datetime/DateTimePicker";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";
import Dialog from "@/components/ui/Dialog";
import LeadTimeSelect from "@/components/notifications/LeadTimeSelect";
import {
  useCreateLearningItem,
  useCreateLearningSubtopic,
  useCreateLearningTopic,
  useDeleteLearningItem,
  useDeleteLearningSubtopic,
  useDeleteLearningTopic,
  useLearningTopics,
  useToggleLearningItem,
  useUpdateLearningItem,
  useUpdateLearningSubtopic,
  useUpdateLearningTopic,
} from "@/hooks/useLearning";
import { alertStore } from "@/stores/alert-store";
import {
  LearningItemRequest,
  LearningItemResponse,
  LearningSubtopicRequest,
  LearningSubtopicResponse,
  LearningTopicRequest,
  LearningTopicResponse,
} from "@/types/learning/learning";
import { parseAxiosError } from "@/utils/handleError";
import { formatDateTime } from "@/utils/i18n-date";

const OPEN_TOPICS_KEY = "learning.openTopics";
const YEAR_KEY = "learning.year";

function readOpenTopics(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OPEN_TOPICS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeOpenTopics(ids: Set<string>) {
  try {
    localStorage.setItem(OPEN_TOPICS_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage can be unavailable (private mode); the open state just won't persist.
  }
}

function readYear(): number | "all" {
  try {
    const stored = Number(localStorage.getItem(YEAR_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : "all";
  } catch {
    return "all";
  }
}

export default function LearningPage() {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const { data, isLoading, isError, refetch } = useLearningTopics();
  const [editingTopic, setEditingTopic] = useState<LearningTopicResponse | null | undefined>();
  const [editingItem, setEditingItem] = useState<{
    item: LearningItemResponse;
    subtopics: LearningSubtopicResponse[];
  } | null>(null);
  const [editingSubtopic, setEditingSubtopic] = useState<
    { topicId: string; subtopic: LearningSubtopicResponse | null } | undefined
  >();
  const topics = data ?? [];
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [selectedYear, setSelectedYear] = useState<number | "all">("all");
  useEffect(() => {
    setOpenIds(readOpenTopics());
    setSelectedYear(readYear());
  }, []);
  const years = useMemo(
    () =>
      [...new Set(topics.map((topic) => new Date(topic.createdAt).getFullYear()))].sort(
        (a, b) => b - a,
      ),
    [topics],
  );
  const year =
    typeof selectedYear === "number" && years.includes(selectedYear) ? selectedYear : "all";
  const visibleTopics = useMemo(
    () =>
      year === "all"
        ? topics
        : topics.filter((topic) => new Date(topic.createdAt).getFullYear() === year),
    [topics, year],
  );
  const allVisibleOpen = visibleTopics.length > 0 && visibleTopics.every((t) => openIds.has(t.id));
  const updateOpen = (next: Set<string>) => {
    setOpenIds(next);
    writeOpenTopics(next);
  };
  const toggleTopic = (id: string) => {
    const next = new Set(openIds);
    if (!next.delete(id)) next.add(id);
    updateOpen(next);
  };
  const toggleAllVisible = () => {
    const next = new Set(openIds);
    for (const topic of visibleTopics) {
      if (allVisibleOpen) next.delete(topic.id);
      else next.add(topic.id);
    }
    updateOpen(next);
  };
  const changeYear = (value: string) => {
    const next = value === "all" ? "all" : Number(value);
    setSelectedYear(next);
    try {
      localStorage.setItem(YEAR_KEY, String(next));
    } catch {
      // Ignore: the filter just won't persist.
    }
  };
  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("learning.title", "Learning")}
        kicker={t("learning.kicker", "Learning tracker")}
        flourish={t("learning.flourish", "curiosity")}
      />
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">
          {t("learning.intro", "Track what you are learning, one item at a time.")}
        </p>
        {/* Controls wrap onto as many lines as a narrow screen needs; the primary action stays last. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {years.length > 1 && (
            <select
              value={year}
              onChange={(e) => changeYear(e.target.value)}
              aria-label={t("learning.yearFilter", "Filter by year")}
              className="husrev-input h-10 w-auto min-w-0 max-w-full text-sm"
            >
              <option value="all">{t("learning.allYears", "All years")}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          {visibleTopics.length > 0 && (
            <button
              type="button"
              onClick={toggleAllVisible}
              className="husrev-btn-ghost h-10 shrink-0 px-3 text-sm"
            >
              {allVisibleOpen
                ? t("learning.collapseAll", "Collapse all")
                : t("learning.expandAll", "Expand all")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditingTopic(null)}
            className="husrev-btn h-10 shrink-0"
          >
            <BiPlus className="h-4 w-4" />
            {t("learning.newTopic", "New topic")}
          </button>
        </div>
      </div>
      {isError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl ring-1 ring-husrev-sand bg-white px-4 py-3 text-sm text-error-500 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <span>{t("learning.error", "Topics could not be loaded.")}</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded px-2 py-1 text-xs text-husrev-ember hover:underline"
          >
            {t("common.retry", "Retry")}
          </button>
        </div>
      )}
      {isLoading && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-husrev-sand/40 motion-safe:animate-pulse motion-reduce:opacity-50"
            />
          ))}
        </div>
      )}
      {!isLoading && !isError && !topics.length && (
        <div className="rounded-2xl ring-1 ring-husrev-sand bg-white px-6 py-12 text-center shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <div className="husrev-kicker text-husrev-amber">
            {t("learning.empty.kicker", "Your learning list is empty")}
          </div>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
            {t(
              "learning.empty.body",
              "Create a topic and begin collecting the things you want to master.",
            )}
          </p>
          <button type="button" onClick={() => setEditingTopic(null)} className="husrev-btn mt-5">
            {t("learning.newTopic", "New topic")}
          </button>
        </div>
      )}
      <div className="space-y-4">
        {visibleTopics.map((topic, index) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            index={index}
            isOpen={openIds.has(topic.id)}
            onToggle={() => toggleTopic(topic.id)}
            onEdit={() => setEditingTopic(topic)}
            onEditItem={setEditingItem}
            onOpenSubtopicModal={(subtopic) => setEditingSubtopic({ topicId: topic.id, subtopic })}
            showAlert={showAlert}
          />
        ))}
      </div>
      {editingTopic !== undefined && (
        <TopicModal
          initial={editingTopic}
          onClose={() => setEditingTopic(undefined)}
          showAlert={showAlert}
        />
      )}
      {editingItem && (
        <ItemModal
          initial={editingItem.item}
          subtopics={editingItem.subtopics}
          onClose={() => setEditingItem(null)}
          showAlert={showAlert}
        />
      )}
      {editingSubtopic !== undefined && (
        <SubtopicModal
          topicId={editingSubtopic.topicId}
          initial={editingSubtopic.subtopic}
          onClose={() => setEditingSubtopic(undefined)}
          showAlert={showAlert}
        />
      )}
    </div>
  );
}

function TopicCard({
  topic,
  index,
  isOpen,
  onToggle,
  onEdit,
  onEditItem,
  onOpenSubtopicModal,
  showAlert,
}: {
  topic: LearningTopicResponse;
  index: number;
  isOpen: boolean;
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
    <article className="relative overflow-hidden rounded-2xl bg-white shadow-card-warm ring-1 ring-husrev-sand/90 dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-husrev-amber" aria-hidden="true" />
      {/* Header: a compact, scannable row when collapsed (title, one-line description, progress). */}
      <div className="px-3 pb-3.5 pt-2.5 sm:px-5 sm:pb-4 sm:pt-3">
        <div className="flex items-start gap-1 sm:gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={`topic-body-${topic.id}`}
            aria-label={topic.title}
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition dark:text-gray-400 hover:bg-husrev-cream/70 hover:text-husrev-ember dark:hover:bg-white/[0.05] dark:hover:text-husrev-amber"
          >
            <BiChevronDown
              className={`h-5 w-5 transition-transform ${isOpen ? "" : "-rotate-90"}`}
            />
          </button>
          <button type="button" onClick={onEdit} className="min-w-0 flex-1 py-2 text-left">
            <h3 className="flex items-baseline gap-2 text-[17px] font-semibold leading-6 tracking-tight text-husrev-ink sm:text-lg dark:text-husrev-cream">
              <span className="shrink-0 text-xs font-medium tabular-nums text-husrev-ink/50 dark:text-husrev-cream/50">
                {index + 1}.
              </span>
              <span className="min-w-0">{topic.title}</span>
            </h3>
            {topic.description && (
              <p
                className={`mt-0.5 text-sm leading-6 text-gray-500 dark:text-gray-400 ${isOpen ? "" : "truncate"}`}
              >
                {topic.description}
              </p>
            )}
          </button>
          <div className="flex shrink-0 items-center gap-0.5 pt-1.5 sm:gap-1">
            <span className="whitespace-nowrap px-1.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
              {t("learning.progress", { done: topic.completedCount, total: topic.itemCount })}
              {hasSubtopics && (
                <span className="text-gray-500 dark:text-gray-400">
                  {" · "}
                  {t("learning.subtopicCount", { count: topic.subtopics.length })}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onEdit}
              aria-label={t("common.edit", "Edit")}
              className={iconButtonClass}
            >
              <BiPencil className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          className="ml-11 mt-1.5 h-1 overflow-hidden rounded-full bg-husrev-sand/50 sm:ml-12 dark:bg-white/[0.06]"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-husrev-amber transition-all"
            style={{ width: `${pct}%` }}
          />
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

function TopicModal({
  initial,
  onClose,
  showAlert,
}: {
  initial: LearningTopicResponse | null;
  onClose: () => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const create = useCreateLearningTopic();
  const update = useUpdateLearningTopic();
  const remove = useDeleteLearningTopic();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [confirming, setConfirming] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: LearningTopicRequest = {
        title: title.trim(),
        description: description.trim() || null,
      };
      if (initial) {
        await update.mutateAsync({ id: initial.id, body });
      } else {
        await create.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      const x = parseAxiosError(err);
      showAlert({ ...x, type: "error", position: "top-center" });
    }
  };
  return (
    <Modal onClose={onClose} titleId="learning-topic-modal-title">
      <form onSubmit={submit}>
        <ModalTitle
          id="learning-topic-modal-title"
          kicker={initial ? t("learning.modal.editKicker") : t("learning.modal.newKicker")}
          title={initial ? t("learning.modal.editTitle") : t("learning.modal.createTitle")}
        />
        <div className="mt-6 space-y-4">
          <Field label={t("learning.field.title")}>
            <input
              required
              autoFocus
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="husrev-input"
              placeholder={t("learning.placeholders.title")}
            />
          </Field>
          <Field label={t("learning.field.description")}>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="husrev-input resize-none"
              placeholder={t("learning.placeholders.description")}
            />
          </Field>
        </div>
        <Actions
          onClose={onClose}
          pending={create.isPending || update.isPending || remove.isPending}
        />
        {initial && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 text-sm text-error-500 hover:underline"
          >
            <BiTrash className="mr-1 inline" />
            {t("common.delete", "Delete")}
          </button>
        )}
      </form>
      <DeleteConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          if (!initial) return;
          await remove.mutateAsync(initial.id);
          onClose();
        }}
        isPending={remove.isPending}
        title={t("learning.confirmDeleteTitle")}
        message={t("learning.confirmDeleteTopic")}
      />
    </Modal>
  );
}

function SubtopicModal({
  topicId,
  initial,
  onClose,
  showAlert,
}: {
  topicId: string;
  initial: LearningSubtopicResponse | null;
  onClose: () => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const create = useCreateLearningSubtopic();
  const update = useUpdateLearningSubtopic();
  const remove = useDeleteLearningSubtopic();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [confirming, setConfirming] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: LearningSubtopicRequest = {
        title: title.trim(),
        description: description.trim() || null,
      };
      if (initial) {
        await update.mutateAsync({ id: initial.id, body });
      } else {
        await create.mutateAsync({ topicId, body });
      }
      onClose();
    } catch (err) {
      const x = parseAxiosError(err);
      showAlert({ ...x, type: "error", position: "top-center" });
    }
  };
  return (
    <Modal onClose={onClose} titleId="learning-subtopic-modal-title">
      <form onSubmit={submit}>
        <ModalTitle
          id="learning-subtopic-modal-title"
          kicker={
            initial ? t("learning.modal.subtopicEditKicker") : t("learning.modal.subtopicNewKicker")
          }
          title={
            initial
              ? t("learning.modal.subtopicEditTitle")
              : t("learning.modal.subtopicCreateTitle")
          }
        />
        <div className="mt-6 space-y-4">
          <Field label={t("learning.field.title")}>
            <input
              required
              autoFocus
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="husrev-input"
              placeholder={t("learning.placeholders.title")}
            />
          </Field>
          <Field label={t("learning.field.description")}>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="husrev-input resize-none"
              placeholder={t("learning.placeholders.description")}
            />
          </Field>
        </div>
        <Actions
          onClose={onClose}
          pending={create.isPending || update.isPending || remove.isPending}
        />
        {initial && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-4 text-sm text-error-500 hover:underline"
          >
            <BiTrash className="mr-1 inline" />
            {t("common.delete", "Delete")}
          </button>
        )}
      </form>
      <DeleteConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          if (!initial) return;
          try {
            await remove.mutateAsync(initial.id);
            onClose();
          } catch (err) {
            const x = parseAxiosError(err);
            showAlert({ ...x, type: "error", position: "top-center" });
          }
        }}
        isPending={remove.isPending}
        title={t("learning.confirmDeleteSubtopicTitle")}
        message={t("learning.confirmDeleteSubtopic")}
      />
    </Modal>
  );
}

function ItemModal({
  initial,
  subtopics,
  onClose,
  showAlert,
}: {
  initial: LearningItemResponse;
  subtopics: LearningSubtopicResponse[];
  onClose: () => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const update = useUpdateLearningItem();
  const [text, setText] = useState(initial.text);
  const [subtopicId, setSubtopicId] = useState(initial.subtopicId ?? "");
  const [url, setUrl] = useState(initial.url ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [minutes, setMinutes] = useState(initial.estimatedMinutes?.toString() ?? "");
  const [reviewAt, setReviewAt] = useState<string | null>(initial.reviewAt);
  const [lead, setLead] = useState<number | null>(initial.notifyMinutesBefore);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: LearningItemRequest = {
        text: text.trim(),
        subtopicId: subtopicId || null,
        url: url.trim() || null,
        notes: notes.trim() || null,
        estimatedMinutes: minutes === "" ? null : Number(minutes),
        reviewAt,
        notifyMinutesBefore: lead,
      };
      await update.mutateAsync({ id: initial.id, body });
      onClose();
    } catch (err) {
      const x = parseAxiosError(err);
      showAlert({ ...x, type: "error", position: "top-center" });
    }
  };
  return (
    <Modal onClose={onClose} titleId="learning-item-modal-title">
      <form onSubmit={submit}>
        <ModalTitle
          id="learning-item-modal-title"
          kicker={t("learning.modal.editKicker")}
          title={t("learning.modal.itemEditTitle")}
        />
        <div className="mt-6 space-y-4">
          <Field label={t("learning.field.itemText")}>
            <input
              required
              autoFocus
              maxLength={300}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="husrev-input"
            />
          </Field>
          <Field label={t("learning.field.subtopicSelect")}>
            <select
              value={subtopicId}
              onChange={(e) => setSubtopicId(e.target.value)}
              className="husrev-input"
            >
              <option value="">{t("learning.field.subtopicNone")}</option>
              {subtopics.map((subtopic) => (
                <option key={subtopic.id} value={subtopic.id}>
                  {subtopic.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("learning.field.url")}>
            <input
              type="url"
              maxLength={512}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="husrev-input"
            />
          </Field>
          <Field label={t("learning.field.notes")}>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="husrev-input resize-none"
            />
          </Field>
          <Field label={t("learning.field.estimatedMinutes")}>
            <input
              type="number"
              min="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="husrev-input"
            />
          </Field>
          <Field label={t("learning.field.reviewAt")}>
            <DateTimePicker value={reviewAt} onChange={setReviewAt} />
          </Field>
          <LeadTimeSelect value={lead} onChange={setLead} disabled={!reviewAt} />
        </div>
        <Actions onClose={onClose} pending={update.isPending} />
      </form>
    </Modal>
  );
}
function Modal({
  children,
  onClose,
  titleId,
}: {
  children: React.ReactNode;
  onClose: () => void;
  titleId: string;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 p-4 backdrop-blur-sm"
      panelClassName="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl husrev-modal grain p-5 sm:p-7 husrev-settle"
      labelledBy={titleId}
    >
      {children}
    </Dialog>
  );
}
function ModalTitle({ id, kicker, title }: { id: string; kicker: string; title: string }) {
  return (
    <div>
      <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">{kicker}</span>
      <h3
        id={id}
        className="mt-1 text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream"
      >
        {title}
      </h3>
    </div>
  );
}
function Actions({ onClose, pending }: { onClose: () => void; pending: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" onClick={onClose} disabled={pending} className="husrev-btn-ghost">
        {t("common.cancel", "Cancel")}
      </button>
      <button type="submit" disabled={pending} className="husrev-btn">
        {pending ? t("common.saving", "Saving…") : t("common.save", "Save")}
      </button>
    </div>
  );
}
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="husrev-kicker text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}
