"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiPlus, BiTrash } from "react-icons/bi";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import DateTimePicker from "@/components/datetime/DateTimePicker";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";
import Dialog from "@/components/ui/Dialog";
import LeadTimeSelect from "@/components/notifications/LeadTimeSelect";
import {
  useCreateLearningSubtopic,
  useCreateLearningTopic,
  useDeleteLearningSubtopic,
  useDeleteLearningTopic,
  useLearningTopics,
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
import {
  buildYearTabs,
  readStoredYear,
  topicYear,
  writeStoredYear,
  yearOptions,
  YearTabId,
} from "./learning-year";
import TopicCard from "./TopicCard";
import YearTabs, { TOPICS_PANEL_ID, yearTabDomId } from "./YearTabs";

const OPEN_TOPICS_KEY = "learning.openTopics";

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
  const [selectedYear, setSelectedYear] = useState<YearTabId>("all");
  useEffect(() => {
    setOpenIds(readOpenTopics());
    setSelectedYear(readStoredYear());
  }, []);
  const yearTabs = useMemo(() => buildYearTabs(topics, new Date().getFullYear()), [topics]);
  // A stored year that no longer has a tab (data changed, clock moved on) falls back to All.
  const year = yearTabs.some((tab) => tab.id === selectedYear) ? selectedYear : "all";
  const visibleTopics = useMemo(
    () => (year === "all" ? topics : topics.filter((topic) => topicYear(topic) === year)),
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
  const changeYear = (next: YearTabId) => {
    setSelectedYear(next);
    writeStoredYear(next);
  };
  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("learning.title", "Learning")}
        kicker={t("learning.kicker", "Learning tracker")}
        flourish={t("learning.flourish", "curiosity")}
      />
      <p className="max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">
        {t("learning.intro", "Track what you are learning, one item at a time.")}
      </p>
      {/* Tabs on the left (their own, scrollable row on small screens); actions on the right. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <YearTabs tabs={yearTabs} value={year} onChange={changeYear} />
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
      {/* No dense flow: an open card spans the row and the numbering must keep reading in order. */}
      <div
        id={TOPICS_PANEL_ID}
        role="tabpanel"
        aria-labelledby={yearTabDomId(year)}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {topics.length > 0 && visibleTopics.length === 0 && typeof year === "number" && (
          <div className="rounded-2xl ring-1 ring-husrev-sand bg-white px-6 py-10 text-center shadow-card-warm sm:col-span-2 xl:col-span-3 dark:bg-husrev-shadow dark:ring-white/[0.06]">
            <div className="husrev-kicker text-husrev-amber">
              {t("learning.emptyYear.kicker", "Nothing filed under {{year}} yet", { year })}
            </div>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">
              {t(
                "learning.emptyYear.body",
                "Create a topic for this year, or switch back to all years to see everything.",
              )}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setEditingTopic(null)} className="husrev-btn">
                <BiPlus className="h-4 w-4" />
                {t("learning.newTopic", "New topic")}
              </button>
              <button type="button" onClick={() => changeYear("all")} className="husrev-btn-ghost">
                {t("learning.showAllYears", "Show all years")}
              </button>
            </div>
          </div>
        )}
        {visibleTopics.map((topic, index) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            index={index}
            isOpen={openIds.has(topic.id)}
            yearBadge={year === "all" ? topicYear(topic) : null}
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
          topics={topics}
          activeYear={year}
          onClose={() => setEditingTopic(undefined)}
          // A topic created under another year's tab would otherwise vanish on save. On All it is
          // already visible, so the tab (and the stored choice) stay as they are.
          onCreated={(createdYear) => {
            if (year !== "all") changeYear(createdYear);
          }}
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

function TopicModal({
  initial,
  topics,
  activeYear,
  onClose,
  onCreated,
  showAlert,
}: {
  initial: LearningTopicResponse | null;
  /** All loaded topics; their years feed the year choices. */
  topics: LearningTopicResponse[];
  /** The selected year tab, which a new topic is filed under by default. */
  activeYear: YearTabId;
  onClose: () => void;
  /** Called with the created topic's year (as the server resolved it) after a successful create. */
  onCreated: (year: number) => void;
  showAlert: ReturnType<typeof alertStore.getState>["show"];
}) {
  const { t } = useTranslation();
  const create = useCreateLearningTopic();
  const update = useUpdateLearningTopic();
  const remove = useDeleteLearningTopic();
  const currentYear = new Date().getFullYear();
  // The web cannot tell a stored year from a derived one, so an edit only sends `year` when the
  // owner actually changed it; otherwise a title fix would pin the derived year into the column.
  const [initialYear] = useState(() =>
    initial ? topicYear(initial) : typeof activeYear === "number" ? activeYear : currentYear,
  );
  const years = useMemo(
    () => yearOptions(topics, currentYear, initialYear),
    [topics, currentYear, initialYear],
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [year, setYear] = useState(initialYear);
  const [confirming, setConfirming] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: LearningTopicRequest = {
        title: title.trim(),
        description: description.trim() || null,
      };
      if (initial) {
        if (year !== initialYear) body.year = year;
        await update.mutateAsync({ id: initial.id, body });
      } else {
        body.year = year;
        const response = await create.mutateAsync(body);
        const created = response?.data;
        onCreated(created ? topicYear(created) : year);
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
          <Field label={t("learning.field.year")}>
            <select
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
              className="husrev-input"
            >
              {years.map((option) => (
                <option key={option} value={String(option)}>
                  {option}
                </option>
              ))}
            </select>
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
