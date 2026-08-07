"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  useCreateProject,
  useDeleteProject,
  useProjects,
  useRestoreProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import { alertStore, showUndoToast } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { exportAsXlsx } from "@/utils/export";
import { formatDate } from "@/utils/i18n-date";
import { ProjectResponse } from "@/types/project/project";
import { ProjectFilter } from "@/utils/api-endpoints";
import RoleBadge from "./RoleBadge";
import {
  BiPlus,
  BiTrash,
  BiFolder,
  BiRightArrowAlt,
  BiPin,
  BiSolidPin,
  BiArchive,
  BiDownload,
  BiGroup,
} from "react-icons/bi";

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const create = useCreateProject();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    try {
      await create.mutateAsync({
        code: code.trim(),
        name: name.trim(),
        description: description || null,
      });
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
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
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {t("projects.modal.kicker")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("projects.modal.title")}{" "}
              <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
                {t("projects.modal.flourish")}
              </span>
            </h3>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
            <BiFolder size={18} />
          </div>
        </div>

        <div className="husrev-rule mt-5" />

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("projects.modal.codeField")}
            </label>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("projects.modal.codePlaceholder")}
              maxLength={32}
              className="husrev-input font-mono tracking-widest"
            />
          </div>
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("projects.modal.nameField")}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("projects.modal.namePlaceholder")}
              className="husrev-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("projects.modal.descriptionField")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("projects.modal.descriptionPlaceholder")}
              rows={3}
              className="husrev-input resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="husrev-btn-ghost">
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!code.trim() || !name.trim() || create.isPending}
              className="husrev-btn"
            >
              {create.isPending ? t("projects.modal.submitting") : t("projects.modal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const { data: projects = [], isLoading } = useProjects(filter);
  const remove = useDeleteProject();
  const restoreProject = useRestoreProject();
  const updateProject = useUpdateProject();
  const [showModal, setShowModal] = useState(false);

  const handleDelete = async (id: number) => {
    const project = projects.find((p) => p.id === id);
    try {
      await remove.mutateAsync(id);
      showUndoToast({
        message: t("projects.undo.projectDeleted", { name: project?.name ?? id }),
        onUndo: () => restoreProject.mutateAsync(id),
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleTogglePin = async (project: ProjectResponse) => {
    try {
      await updateProject.mutateAsync({
        id: project.id,
        body: { pinned: !project.pinned },
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleExportAll = () => {
    const rows = projects.map((p) => ({
      Code: p.code,
      Name: p.name,
      Status: p.status ? t(`projects.statuses.${p.status}`) : "",
      "Start Date": p.startDate ? formatDate(p.startDate) : "",
      "End Date": p.endDate ? formatDate(p.endDate) : "",
      Pinned: p.pinned ? t("common.yes") : t("common.no"),
      Archived: p.archived ? t("common.yes") : t("common.no"),
    }));
    exportAsXlsx("projects.xlsx", rows, "Projects");
  };

  const handleToggleArchive = async (project: ProjectResponse) => {
    try {
      await updateProject.mutateAsync({
        id: project.id,
        body: { archived: !project.archived },
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("projects.title")}
        kicker={t("projects.kicker")}
        flourish={t("projects.flourish")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          {t("projects.introBefore")}{" "}
          <span className="font-instrument-serif italic text-husrev-ember dark:text-husrev-amber">
            {t("projects.introEm")}
          </span>{" "}
          {t("projects.introAfter")}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAll}
            disabled={projects.length === 0}
            className="husrev-btn-ghost disabled:opacity-50 disabled:pointer-events-none"
          >
            <BiDownload size={16} /> {t("projects.export")}
          </button>
          <button onClick={() => setShowModal(true)} className="husrev-btn">
            <BiPlus size={16} /> {t("projects.newProject")}
          </button>
        </div>
      </div>

      <div className="inline-flex rounded-xl ring-1 ring-husrev-sand/90 bg-white/60 p-1 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        {(["all", "mine", "shared"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
              filter === f
                ? "bg-husrev-ember text-husrev-cream shadow-sm"
                : "text-husrev-shadow hover:bg-husrev-cream dark:text-husrev-cream dark:hover:bg-white/5"
            }`}
          >
            {t(`projects.filter.${f}`, f === "all" ? "Tümü" : f === "mine" ? "Benim" : "Paylaşılan")}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-36 rounded-2xl ring-1 ring-husrev-sand/90 bg-white/60 animate-pulse dark:bg-husrev-shadow/60 dark:ring-white/[0.06]"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl ring-1 ring-dashed ring-husrev-sand bg-husrev-cream/50 grain p-12 text-center dark:bg-husrev-shadow/60 dark:ring-white/[0.06]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
            <BiFolder size={22} />
          </div>
          <h3 className="mt-5 text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("projects.empty.title")}{" "}
            <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
              {t("projects.empty.flourish")}
            </span>
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            {t("projects.empty.body")}
          </p>
          <button onClick={() => setShowModal(true)} className="husrev-btn mt-6">
            <BiPlus size={16} /> {t("projects.empty.cta")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 husrev-stagger">
          {projects.map((p) => (
            <article
              key={p.id}
              className="group relative overflow-hidden rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm husrev-lift dark:bg-husrev-shadow dark:ring-white/[0.06]"
            >
              <span className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-husrev-amber/8 blur-2xl transition-opacity duration-500 group-hover:bg-husrev-amber/20" />
              <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-husrev-amber via-husrev-ember to-husrev-amber/0 opacity-50 transition-opacity duration-300 group-hover:opacity-100" />

              <div className="flex justify-end gap-1 p-3 pb-0">
                {p.role !== "VIEWER" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePin(p);
                    }}
                    className="rounded-full p-2 text-gray-400 transition hover:bg-husrev-amber/10 hover:text-husrev-amber"
                    aria-label={t("projects.pinAria")}
                  >
                    {p.pinned ? <BiSolidPin size={16} /> : <BiPin size={16} />}
                  </button>
                )}

                {p.role === "OWNER" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleArchive(p);
                    }}
                    className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                    aria-label={t("projects.archiveAria")}
                  >
                    <BiArchive size={16} />
                  </button>
                )}

                {p.role === "OWNER" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                    aria-label={t("projects.deleteAria")}
                  >
                    <BiTrash size={16} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => router.push(`/projects/${p.id}`)}
                className="block w-full cursor-pointer p-5 pl-6 pt-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
                    <BiFolder size={18} />
                  </span>
                  <span className="rounded-md bg-husrev-sand/60 px-1.5 py-0.5 text-[11px] font-mono uppercase tracking-[0.12em] text-husrev-shadow dark:bg-white/5 dark:text-husrev-cream">
                    {p.code}
                  </span>
                </div>
                <h3 className="mt-3.5 text-lg font-semibold leading-tight tracking-tight text-husrev-ink dark:text-husrev-cream group-hover:text-husrev-ember dark:group-hover:text-husrev-amber transition-colors">
                  {p.name}
                </h3>
                {p.description && (
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                    {p.description}
                  </p>
                )}

                {(p.role !== "OWNER" || p.memberCount > 1) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-md bg-husrev-moss/10 px-1.5 py-0.5 text-[11px] font-mono uppercase tracking-[0.12em] text-husrev-moss dark:bg-husrev-moss/20">
                      {t("projects.shared", "Paylaşılan")}
                    </span>
                    <RoleBadge role={p.role} />
                    {p.memberCount > 1 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-husrev-sand/60 px-1.5 py-0.5 text-[11px] text-husrev-shadow dark:bg-white/5 dark:text-husrev-cream">
                        <BiGroup size={11} />
                        {t("projects.memberCount", "{{count}} kişi", { count: p.memberCount })}
                      </span>
                    )}
                    {p.role !== "OWNER" && p.ownerName && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {t("projects.ownedBy", "sahip: {{name}}", { name: p.ownerName })}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <span className="husrev-kicker text-gray-400 dark:text-gray-500">
                    {t("projects.openBoard")}
                  </span>
                  <BiRightArrowAlt
                    size={18}
                    className="text-husrev-ember dark:text-husrev-amber translate-x-0 transition-transform duration-300 group-hover:translate-x-1"
                  />
                </div>
              </button>
            </article>
          ))}
        </div>
      )}

      {showModal && <NewProjectModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
