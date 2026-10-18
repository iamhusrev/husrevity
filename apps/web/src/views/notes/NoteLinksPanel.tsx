"use client";

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiCheckSquare, BiFolder, BiPlus, BiTargetLock, BiX } from "react-icons/bi";
import Dialog from "@/components/ui/Dialog";
import { useGoals } from "@/hooks/useGoals";
import { useAddNoteLink, useNoteLinks, useRemoveNoteLink } from "@/hooks/useNoteLinks";
import { useProjects } from "@/hooks/useProjects";
import { showUndoToast } from "@/stores/alert-store";
import { NoteLinkResponse, NoteLinkTargetType } from "@/types/note-link/note-link";
import { errorMessage } from "@/utils/mutation-error";

const TYPE_ICON = {
  goal: BiTargetLock,
  project: BiFolder,
  item: BiCheckSquare,
} as const;

type AddableType = "goal" | "project";
const ADDABLE_TYPES: AddableType[] = ["goal", "project"];

export interface NoteLinksPanelProps {
  noteId: string;
}

export default function NoteLinksPanel({ noteId }: NoteLinksPanelProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: links, isLoading, isError, refetch } = useNoteLinks(noteId);
  const removeMutation = useRemoveNoteLink(noteId);
  // Separate instance for undo: a failed re-add raises the hook's own single alert.
  const undoAddMutation = useAddNoteLink(noteId);

  const handleRemove = (link: NoteLinkResponse) => {
    if (removeMutation.isPending) return;
    removeMutation.mutate(link.id, {
      onSuccess: () =>
        showUndoToast({
          title: t("noteLinks.removed"),
          message: link.targetTitle ?? t("noteLinks.dangling"),
          actionLabel: t("noteLinks.undo"),
          onUndo: () =>
            undoAddMutation.mutate({ targetType: link.targetType, targetId: link.targetId }),
        }),
    });
  };

  return (
    <aside
      aria-labelledby="note-links-heading"
      className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-husrev-shadow"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="note-links-heading" className="text-sm font-semibold text-gray-900 dark:text-white">
          {t("noteLinks.title")}
        </h3>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/30"
        >
          <BiPlus size={16} />
          {t("noteLinks.add")}
        </button>
      </div>

      {isLoading ? (
        <div
          data-testid="note-links-loading"
          className="mt-3 h-10 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]"
        />
      ) : isError ? (
        <div role="alert" className="mt-3 text-xs text-red-600">
          {t("noteLinks.error")}{" "}
          <button type="button" onClick={() => refetch()} className="underline cursor-pointer">
            {t("noteLinks.retry")}
          </button>
        </div>
      ) : !links || links.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t("noteLinks.empty")}</p>
      ) : (
        <ul className="m-0 mt-3 list-none space-y-2 p-0">
          {links.map((link) => {
            const Icon = TYPE_ICON[link.targetType];
            const dangling = link.targetTitle === null;
            return (
              <li
                key={link.id}
                data-testid={`note-link-${link.id}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-2 dark:border-white/[0.06]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Icon size={16} aria-hidden="true" className="shrink-0 text-gray-500" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {t(`noteLinks.type.${link.targetType}`)}
                    </p>
                    <p
                      className={`truncate text-sm ${
                        dangling
                          ? "italic text-gray-500 dark:text-gray-400"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {dangling ? t("noteLinks.dangling") : link.targetTitle}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={removeMutation.isPending}
                  aria-label={`${t("noteLinks.remove")}: ${link.targetTitle ?? t("noteLinks.dangling")}`}
                  onClick={() => handleRemove(link)}
                  className="cursor-pointer rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/5"
                >
                  <BiX size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
        {t("noteLinks.itemHelper")}
      </p>

      {dialogOpen && <AddLinkDialog noteId={noteId} onClose={() => setDialogOpen(false)} />}
    </aside>
  );
}

function AddLinkDialog({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const { t } = useTranslation();

  const addMutation = useAddNoteLink(noteId, { inlineErrors: true });
  const { data: goals } = useGoals({ limit: 200 });
  const { data: projects } = useProjects();

  const [type, setType] = useState<AddableType>("goal");
  const [targetId, setTargetId] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  const options = useMemo(() => {
    if (type === "goal") {
      return (goals ?? []).map((g) => ({ id: String(g.id), label: g.title }));
    }
    return (projects ?? [])
      .filter((p) => !p.archived)
      .map((p) => ({ id: String(p.id), label: p.name }));
  }, [type, goals, projects]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (addMutation.isPending || !targetId) return;
    setServerError(null);
    addMutation.mutate(
      { targetType: type as NoteLinkTargetType, targetId },
      {
        onSuccess: () => onClose(),
        onError: (err: unknown) => setServerError(errorMessage(err)),
      },
    );
  };

  const field =
    "mt-1 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-husrev-ink dark:text-white";

  return (
    <Dialog
      open={true}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[100001] flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      panelClassName="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-gray-200 dark:bg-husrev-shadow dark:ring-white/10"
      labelledBy="note-link-dialog-title"
      portal
      panelAs="form"
      panelProps={{ onSubmit: handleSubmit }}
    >
      <h2
        id="note-link-dialog-title"
        className="text-base font-semibold text-gray-900 dark:text-white"
      >
        {t("noteLinks.dialog.title")}
      </h2>

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        {t("noteLinks.dialog.type")}
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value as AddableType);
            setTargetId("");
            setServerError(null);
          }}
          className={field}
        >
          {ADDABLE_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`noteLinks.type.${v}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        {t("noteLinks.dialog.target")}
        <select
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            setServerError(null);
          }}
          className={field}
        >
          <option value="">{t("noteLinks.dialog.placeholder")}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {options.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("noteLinks.dialog.noTargets")}
        </p>
      )}

      {serverError && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-300"
        >
          {serverError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-xl px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]"
        >
          {t("noteLinks.dialog.cancel")}
        </button>
        <button
          type="submit"
          disabled={addMutation.isPending || !targetId}
          className="cursor-pointer rounded-xl bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("noteLinks.dialog.submit")}
        </button>
      </div>
    </Dialog>
  );
}
