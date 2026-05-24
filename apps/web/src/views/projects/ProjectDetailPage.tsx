"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import { useCreateTask, useProject, useProjectTasks } from "@/hooks/useProjects";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { BiPlus, BiArrowBack } from "react-icons/bi";
import KanbanBoard from "./KanbanBoard";
import TaskList from "./TaskList";
import { TaskPriority, TaskStatus } from "@/types/project/project";

type ViewMode = "kanban" | "list";

function NewTaskModal({ code, onClose }: { code: string; onClose: () => void }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("TODO");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await create.mutateAsync({
        code,
        body: {
          title: title.trim(),
          description: description || null,
          status,
          priority,
        },
      });
      onClose();
    } catch (err) {
      const { title: t, message } = parseAxiosError(err);
      showAlert({ title: t, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("kanban.modal.kicker")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("kanban.modal.title")}{" "}
            <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
              {t("kanban.modal.flourish")}
            </span>
          </h3>
        </div>
        <div className="husrev-rule mt-5" />

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("kanban.modal.titleField")}
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("kanban.modal.titlePlaceholder")}
              className="husrev-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("kanban.modal.descriptionField")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("kanban.modal.descriptionPlaceholder")}
              rows={3}
              className="husrev-input resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("kanban.modal.columnField")}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
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
                {t("kanban.modal.priorityField")}
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="husrev-input"
              >
                <option value="LOW">{t("kanban.priority.LOW")}</option>
                <option value="MEDIUM">{t("kanban.priority.MEDIUM")}</option>
                <option value="HIGH">{t("kanban.priority.HIGH")}</option>
                <option value="CRITICAL">{t("kanban.priority.CRITICAL")}</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="husrev-btn-ghost">
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || create.isPending}
              className="husrev-btn"
            >
              {create.isPending ? t("kanban.modal.submitting") : t("kanban.modal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectDetailPage({
  code,
  embedded,
}: {
  code: string;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const initialView = (searchParams.get("view") as ViewMode | null) === "list" ? "list" : "kanban";
  const [view, setView] = useState<ViewMode>(initialView);
  const [showModal, setShowModal] = useState(false);

  const { data: project } = useProject(code);
  const { data: tasks = [], isLoading } = useProjectTasks(code);

  useEffect(() => {
    if (embedded) return; // in a modal — don't rewrite the browser URL
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`/projects/${code}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, code]);

  if (!code) return <p className="p-6 text-gray-500">{t("projects.invalid")}</p>;

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6">
        {!embedded && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/projects")}
              className="shrink-0 rounded-full p-2 text-gray-500 ring-1 ring-husrev-sand/80 bg-white/60 hover:bg-husrev-cream hover:text-husrev-ember dark:bg-husrev-shadow/50 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-husrev-amber transition-colors"
              aria-label={t("kanban.back")}
            >
              <BiArrowBack size={18} />
            </button>
            <div className="flex-1">
              <PageBreadcrumb pageTitle={project?.name ?? code} kicker={code} />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl ring-1 ring-husrev-sand/90 bg-white/60 p-1 dark:bg-husrev-shadow dark:ring-white/[0.06]">
            <button
              onClick={() => setView("kanban")}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                view === "kanban"
                  ? "bg-husrev-ember text-husrev-cream shadow-sm"
                  : "text-husrev-shadow hover:bg-husrev-cream dark:text-husrev-cream dark:hover:bg-white/5"
              }`}
            >
              {t("kanban.view.kanban")}
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                view === "list"
                  ? "bg-husrev-ember text-husrev-cream shadow-sm"
                  : "text-husrev-shadow hover:bg-husrev-cream dark:text-husrev-cream dark:hover:bg-white/5"
              }`}
            >
              {t("kanban.view.list")}
            </button>
          </div>
          <button onClick={() => setShowModal(true)} className="husrev-btn">
            <BiPlus size={16} /> {t("kanban.newTask")}
          </button>
        </div>

        {isLoading ? (
          <p className="text-gray-500">{t("common.loading")}</p>
        ) : view === "kanban" ? (
          <KanbanBoard code={code} tasks={tasks} />
        ) : (
          <TaskList code={code} tasks={tasks} />
        )}

        {showModal && <NewTaskModal code={code} onClose={() => setShowModal(false)} />}
      </div>
    </DndProvider>
  );
}
