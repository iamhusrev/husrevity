"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import DetailModal from "@/components/modal/DetailModal";
import { useDeleteTask, useRestoreTask, useUpdateTask } from "@/hooks/useProjects";
import { TaskPriority, TaskResponse, TaskStatus } from "@/types/project/project";
import { alertStore, showUndoToast } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatDate } from "@/utils/i18n-date";
import DateTimePicker from "@/components/datetime/DateTimePicker";
import AssigneePicker from "./AssigneePicker";

export default function TaskDetailModal({
  task,
  projectId,
  canEdit,
  onClose,
}: {
  task: TaskResponse;
  projectId: number;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const restore = useRestoreTask();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueAt, setDueAt] = useState<string | null>(task.dueAt ?? null);
  const [assigneeId, setAssigneeId] = useState<number | null>(task.assigneeId ?? null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !canEdit) return;
    try {
      await update.mutateAsync({
        id: task.id,
        projectId,
        body: {
          title: title.trim(),
          description: description || null,
          status,
          priority,
          dueAt: dueAt,
          assigneeId,
        },
      });
      onClose();
    } catch (err) {
      const { title: ti, message } = parseAxiosError(err);
      showAlert({ title: ti, message, type: "error", position: "top-center" });
    }
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync({ id: task.id, projectId });
      showUndoToast({
        message: t("projects.undo.taskDeleted", { title: task.title }),
        onUndo: () => restore.mutateAsync({ id: task.id, projectId }),
      });
      onClose();
    } catch (err) {
      const { title: ti, message } = parseAxiosError(err);
      showAlert({ title: ti, message, type: "error", position: "top-center" });
    }
  };

  return (
    <DetailModal
      isOpen
      onClose={onClose}
      title={task.title}
      className="mx-4 my-6 max-h-[90vh] w-full max-w-lg overflow-y-auto p-5 sm:p-7"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="husrev-kicker text-gray-500 dark:text-gray-400">
            {t("kanban.modal.titleField", "Başlık")}
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("kanban.modal.titlePlaceholder", "Görev başlığı")}
            disabled={!canEdit}
            className="husrev-input"
          />
        </div>

        <div className="space-y-1.5">
          <label className="husrev-kicker text-gray-500 dark:text-gray-400">
            {t("kanban.modal.descriptionField", "Açıklama")}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("kanban.modal.descriptionPlaceholder", "Detaylar…")}
            rows={4}
            disabled={!canEdit}
            className="husrev-input resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("kanban.modal.columnField", "Durum")}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              disabled={!canEdit}
              className="husrev-input"
            >
              <option value="TODO">{t("kanban.status.TODO")}</option>
              <option value="IN_PROGRESS">{t("kanban.status.IN_PROGRESS")}</option>
              <option value="DONE">{t("kanban.status.DONE")}</option>
              <option value="CANCELLED">{t("kanban.status.CANCELLED")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("kanban.modal.priorityField", "Öncelik")}
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              disabled={!canEdit}
              className="husrev-input"
            >
              <option value="LOW">{t("kanban.priority.LOW")}</option>
              <option value="MEDIUM">{t("kanban.priority.MEDIUM")}</option>
              <option value="HIGH">{t("kanban.priority.HIGH")}</option>
              <option value="CRITICAL">{t("kanban.priority.CRITICAL")}</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="husrev-kicker text-gray-500 dark:text-gray-400">
            {t("kanban.modal.assigneeField", "Atanan kişi")}
          </label>
          <AssigneePicker
            projectId={projectId}
            value={assigneeId}
            onChange={setAssigneeId}
            disabled={!canEdit}
          />
        </div>

        <div className="space-y-1.5">
          <label className="husrev-kicker text-gray-500 dark:text-gray-400">
            {t("kanban.detail.dueField", "Bitiş tarihi")}
          </label>
          <DateTimePicker value={dueAt} onChange={setDueAt} mode="date" disabled={!canEdit} />
        </div>

        {task.createdAt && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {t("kanban.detail.created", "Oluşturuldu")}:{" "}
            {formatDate(task.createdAt, { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-2">
          {canEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={remove.isPending}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <BiTrash size={15} /> {t("common.delete", "Sil")}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="husrev-btn-ghost">
              {t("common.cancel", "İptal")}
            </button>
            {canEdit && (
              <button
                type="submit"
                disabled={!title.trim() || update.isPending}
                className="husrev-btn"
              >
                {update.isPending
                  ? t("common.saving", "Kaydediliyor…")
                  : t("common.save", "Kaydet")}
              </button>
            )}
          </div>
        </div>
      </form>
    </DetailModal>
  );
}
