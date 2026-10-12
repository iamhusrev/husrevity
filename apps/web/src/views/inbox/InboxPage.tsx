"use client";

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BiCalendarPlus,
  BiCheck,
  BiFolderPlus,
  BiPlus,
  BiTargetLock,
  BiTimeFive,
  BiTrash,
} from "react-icons/bi";
import {
  useCompleteItem,
  useDeleteItem,
  useInboxItems,
  useUpdateItemFields,
} from "@/hooks/useItems";
import { useGoals } from "@/hooks/useGoals";
import { useIstanbulToday } from "@/hooks/useIstanbulToday";
import { useProjects } from "@/hooks/useProjects";
import { useQuickAdd } from "@/providers/QuickAddContext";
import { alertStore } from "@/stores/alert-store";
import { slotToIso } from "@/utils/today-board";
import { ItemResponse } from "@/types/item/item";
import ScheduleModal, { ScheduleModalItem } from "@/components/items/ScheduleModal";

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

type OpenPanel = { id: string; kind: "date" | "project" | "goal" } | null;

function isRecurringItem(item: ItemResponse): boolean {
  return Boolean(item.rrule || item.occursOn || (item as { isRecurring?: boolean }).isRecurring);
}

export default function InboxPage() {
  const { t } = useTranslation();
  const { openQuickAdd } = useQuickAdd();
  const todayYmd = useIstanbulToday();

  const { data: items, isLoading, isError, refetch } = useInboxItems();
  const { data: projects } = useProjects();
  const updateMutation = useUpdateItemFields();
  const completeMutation = useCompleteItem();
  const deleteMutation = useDeleteItem();

  const [panel, setPanel] = useState<OpenPanel>(null);
  const [scheduling, setScheduling] = useState<ScheduleModalItem | null>(null);

  const busy = updateMutation.isPending || completeMutation.isPending || deleteMutation.isPending;

  // Only projects the user may add items to (not viewer-only, not archived).
  const attachableProjects = useMemo(
    () => (projects ?? []).filter((p) => p.role !== "VIEWER" && !p.archived),
    [projects],
  );

  const reportError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    alertStore.getState().show({
      title: t("inbox.errorAction"),
      message: msg || t("inbox.errorAction"),
      type: "error",
    });
  };

  const handleComplete = (item: ItemResponse) => {
    if (busy) return;
    completeMutation.mutate({ id: item.id }, { onError: reportError });
  };

  const handleDelete = (item: ItemResponse) => {
    if (busy || isRecurringItem(item)) return;
    // Items have no restore endpoint, so there is no undo: confirm instead.
    if (!window.confirm(t("inbox.deleteConfirm"))) return;
    deleteMutation.mutate(item.id, { onError: reportError });
  };

  const handleSaveDate = (item: ItemResponse, date: string, time: string) => {
    if (busy || isRecurringItem(item) || !YMD_REGEX.test(date)) return;
    let minutes = 0;
    if (time) {
      const [h, m] = time.split(":").map(Number);
      minutes = (h || 0) * 60 + (m || 0);
    }
    updateMutation.mutate(
      { id: item.id, body: { dueAt: slotToIso(date, minutes) } },
      // Failures are alerted once by useUpdateItemFields itself.
      { onSuccess: () => setPanel(null) },
    );
  };

  const handleAttach = (item: ItemResponse, projectId: string) => {
    if (busy || !projectId) return;
    updateMutation.mutate(
      { id: item.id, body: { projectId } },
      // Failures are alerted once by useUpdateItemFields itself.
      { onSuccess: () => setPanel(null) },
    );
  };

  const handleAttachGoal = (item: ItemResponse, goalId: string) => {
    if (busy || isRecurringItem(item) || !goalId) return;
    updateMutation.mutate(
      { id: item.id, body: { goalId } },
      // Failures are alerted once by useUpdateItemFields itself.
      { onSuccess: () => setPanel(null) },
    );
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-5rem)] p-4 sm:p-6 lg:p-8 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            data-testid="inbox-heading"
            className="text-2xl sm:text-3xl font-serif italic text-gray-900 dark:text-white"
          >
            {t("inbox.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("inbox.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={openQuickAdd}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 cursor-pointer"
        >
          <BiPlus size={16} />
          {t("inbox.capture")}
        </button>
      </header>

      {isLoading ? (
        <div data-testid="inbox-skeleton" className="space-y-2 animate-pulse" aria-label={t("inbox.loading")}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-gray-100 dark:bg-white/[0.03]" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/10">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{t("inbox.error")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-xl bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 cursor-pointer"
          >
            {t("inbox.retry")}
          </button>
        </div>
      ) : !items || items.length === 0 ? (
        <div
          data-testid="inbox-empty"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 p-12 text-center dark:border-white/10"
        >
          <p className="text-base font-semibold text-gray-800 dark:text-white">{t("inbox.empty")}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("inbox.emptyHint")}</p>
        </div>
      ) : (
        <>
          <p data-testid="inbox-count" className="text-xs text-gray-500 dark:text-gray-400">
            {t("inbox.count", { count: items.length })}
          </p>
          <ul className="space-y-2 list-none p-0 m-0">
            {items.map((item) => {
              const recurring = isRecurringItem(item);
              const openKind = panel?.id === item.id ? panel.kind : null;
              return (
                <li
                  key={item.id}
                  data-testid={`inbox-row-${item.id}`}
                  className="rounded-2xl border border-gray-100 bg-white p-3 dark:border-white/[0.04] dark:bg-husrev-shadow"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {item.title}
                    </p>
                    <div
                      role="group"
                      aria-label={t("inbox.actionsFor", { title: item.title })}
                      className="flex items-center gap-1 shrink-0"
                    >
                      {!recurring && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            aria-expanded={openKind === "date"}
                            onClick={() =>
                              setPanel(openKind === "date" ? null : { id: item.id, kind: "date" })
                            }
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer"
                          >
                            <BiCalendarPlus size={16} />
                            {t("inbox.setDate")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setScheduling({
                                id: item.id,
                                title: item.title,
                                durationMin: item.durationMin,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-950/30 cursor-pointer"
                          >
                            <BiTimeFive size={16} />
                            {t("inbox.schedule")}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        aria-expanded={openKind === "project"}
                        onClick={() =>
                          setPanel(openKind === "project" ? null : { id: item.id, kind: "project" })
                        }
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer"
                      >
                        <BiFolderPlus size={16} />
                        {t("inbox.attachProject")}
                      </button>
                      {!recurring && (
                        <button
                          type="button"
                          disabled={busy}
                          aria-expanded={openKind === "goal"}
                          onClick={() =>
                            setPanel(openKind === "goal" ? null : { id: item.id, kind: "goal" })
                          }
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5 cursor-pointer"
                        >
                          <BiTargetLock size={16} />
                          {t("inbox.attachGoal")}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleComplete(item)}
                        aria-label={`${t("inbox.complete")}: ${item.title}`}
                        className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                      >
                        <BiCheck size={18} />
                      </button>
                      {!recurring && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDelete(item)}
                          aria-label={`${t("inbox.delete")}: ${item.title}`}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/30 cursor-pointer"
                        >
                          <BiTrash size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {openKind === "date" && (
                    <DateForm
                      defaultDate={todayYmd}
                      disabled={busy}
                      onSave={(date, time) => handleSaveDate(item, date, time)}
                      onCancel={() => setPanel(null)}
                    />
                  )}
                  {openKind === "goal" && !recurring && (
                    <GoalForm
                      todayYmd={todayYmd}
                      disabled={busy}
                      onSave={(goalId) => handleAttachGoal(item, goalId)}
                      onCancel={() => setPanel(null)}
                    />
                  )}
                  {openKind === "project" && (
                    <ProjectForm
                      projects={attachableProjects.map((p) => ({ id: String(p.id), name: p.name }))}
                      disabled={busy}
                      onSave={(projectId) => handleAttach(item, projectId)}
                      onCancel={() => setPanel(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {scheduling && (
        <ScheduleModal
          item={scheduling}
          todayDate={todayYmd}
          onClose={() => setScheduling(null)}
          onScheduled={() => setScheduling(null)}
        />
      )}
    </div>
  );
}

function DateForm({
  defaultDate,
  disabled,
  onSave,
  onCancel,
}: {
  defaultDate: string;
  disabled: boolean;
  onSave: (date: string, time: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(date, time);
      }}
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-white/10"
    >
      <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
        {t("inbox.dateLabel")}
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
        />
      </label>
      <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
        {t("inbox.timeOptional")}
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="mt-1 block rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
        />
      </label>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 cursor-pointer"
      >
        {t("inbox.saveDate")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 cursor-pointer"
      >
        {t("inbox.cancel")}
      </button>
    </form>
  );
}

function ProjectForm({
  projects,
  disabled,
  onSave,
  onCancel,
}: {
  projects: { id: string; name: string }[];
  disabled: boolean;
  onSave: (projectId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [projectId, setProjectId] = useState("");

  if (projects.length === 0) {
    return (
      <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
        {t("inbox.noProjects")}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(projectId);
      }}
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-white/10"
    >
      <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
        {t("inbox.projectLabel")}
        <select
          required
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="mt-1 block rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
        >
          <option value="">{t("inbox.projectPlaceholder")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={disabled || !projectId}
        className="rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 cursor-pointer"
      >
        {t("inbox.attach")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 cursor-pointer"
      >
        {t("inbox.cancel")}
      </button>
    </form>
  );
}

function GoalForm({
  todayYmd,
  disabled,
  onSave,
  onCancel,
}: {
  todayYmd: string;
  disabled: boolean;
  onSave: (goalId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [goalId, setGoalId] = useState("");
  // Active goals whose period contains today or lies after it (period end >= today).
  const { data: goals } = useGoals({ status: "active", from: todayYmd, limit: 200 });

  if (goals && goals.length === 0) {
    return (
      <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
        {t("inbox.noGoals")}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(goalId);
      }}
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3 dark:border-white/10"
    >
      <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400">
        {t("inbox.goalLabel")}
        <select
          required
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
          className="mt-1 block rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white"
        >
          <option value="">{t("inbox.goalPlaceholder")}</option>
          {(goals ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} · {t(`goals.horizon.${g.horizon}`)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={disabled || !goalId}
        className="rounded-xl bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50 cursor-pointer"
      >
        {t("inbox.attach")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 cursor-pointer"
      >
        {t("inbox.cancel")}
      </button>
    </form>
  );
}
