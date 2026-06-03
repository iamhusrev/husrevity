"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import DetailModal from "@/components/modal/DetailModal";
import PlanDetailPage from "@/views/plans/PlanDetailPage";
import { useCreatePlan, useDeletePlan, usePlans } from "@/hooks/usePlans";
import { PlanResponse } from "@/types/plan/plan";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatMonthShort } from "@/utils/i18n-date";
import DateTimePicker from "@/components/datetime/DateTimePicker";
import { BiPlus, BiTrash, BiTargetLock, BiCalendarEvent } from "react-icons/bi";

const STATUS_TONE: Record<string, { bg: string; dot: string }> = {
  ACTIVE: {
    bg: "bg-husrev-moss/10 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream",
    dot: "bg-husrev-moss",
  },
  COMPLETED: {
    bg: "bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber",
    dot: "bg-husrev-amber",
  },
  PAUSED: {
    bg: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    dot: "bg-gray-400",
  },
  CANCELLED: {
    bg: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    dot: "bg-red-400",
  },
};

function targetMeta(targetDate?: string | null) {
  if (!targetDate) return { hasDate: false } as const;
  const d = new Date(targetDate);
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((targetMid.getTime() - todayMid.getTime()) / 86400000);
  return {
    hasDate: true as const,
    monthShort: formatMonthShort(d),
    day: d.getDate(),
    year: d.getFullYear(),
    diffDays,
    isOverdue: diffDays < 0,
    isSoon: diffDays >= 0 && diffDays <= 7,
  };
}

function NewPlanModal({ onClose }: { onClose: () => void }) {
  const showAlert = alertStore((s) => s.show);
  const create = useCreatePlan();
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description || null,
        targetDate: targetDate,
      });
      onClose();
    } catch (err) {
      const { title: errTitle, message } = parseAxiosError(err);
      showAlert({
        title: errTitle,
        message,
        type: "error",
        position: "top-center",
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl husrev-modal grain p-5 sm:p-7 husrev-settle"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {t("plans.modal.kicker")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("plans.modal.title")}{" "}
              <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
                {t("plans.modal.flourish")}
              </span>
            </h3>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
            <BiTargetLock size={18} />
          </div>
        </div>

        <div className="husrev-rule mt-5" />

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("plans.modal.titleField")}
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("plans.modal.titlePlaceholder")}
              className="husrev-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("plans.modal.descriptionField")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("plans.modal.descriptionPlaceholder")}
              rows={3}
              className="husrev-input resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("plans.modal.targetDate")}
            </label>
            <DateTimePicker value={targetDate} onChange={setTargetDate} mode="date" />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="husrev-btn-ghost">
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!title.trim() || create.isPending}
              className="husrev-btn"
            >
              {create.isPending ? t("plans.modal.submitting") : t("plans.modal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  index,
  onDelete,
  onOpen,
}: {
  plan: PlanResponse;
  index: number;
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const { t } = useTranslation();
  const meta = targetMeta(plan.targetDate);
  const status = plan.status ? STATUS_TONE[plan.status] : null;

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 9) * 50}ms` }}
      className="group relative overflow-hidden rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm husrev-lift husrev-fade-up dark:bg-husrev-shadow dark:ring-white/[0.06]"
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-husrev-amber via-husrev-ember to-husrev-amber/0 opacity-60 group-hover:opacity-100 transition-opacity" />

      <button
        type="button"
        onClick={() => onOpen(plan.id)}
        className="block w-full p-5 pl-6 text-left"
      >
        <div className="flex items-start gap-4">
          {meta.hasDate ? (
            <div className="shrink-0 text-center">
              <div className="husrev-stamp-month">{meta.monthShort}</div>
              <div className="husrev-stamp-day text-husrev-ink dark:text-husrev-cream mt-0.5">
                {meta.day}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-gray-400">
                {meta.year}
              </div>
            </div>
          ) : (
            <div className="shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl border border-dashed border-husrev-sand text-husrev-amber/70 dark:border-white/10">
              <BiCalendarEvent size={18} />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-tight tracking-tight text-husrev-ink dark:text-husrev-cream group-hover:text-husrev-ember dark:group-hover:text-husrev-amber transition-colors">
              {plan.title}
            </h3>
            {plan.description && (
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                {plan.description}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {status && plan.status && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-[0.08em] ${status.bg}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {t(`plans.status.${plan.status}`)}
                </span>
              )}
              {meta.hasDate && (
                <span
                  className={`husrev-pill ${
                    meta.isOverdue
                      ? "!bg-red-50 !text-red-600 dark:!bg-red-500/15 dark:!text-red-300"
                      : meta.isSoon
                        ? "!bg-husrev-amber/15 !text-husrev-ember dark:!bg-husrev-amber/25 dark:!text-husrev-amber"
                        : ""
                  }`}
                >
                  {meta.isOverdue
                    ? t("plans.due.overdue", { count: Math.abs(meta.diffDays) })
                    : meta.diffDays === 0
                      ? t("plans.due.today")
                      : t("plans.due.remaining", { count: meta.diffDays })}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      <button
        onClick={() => onDelete(plan.id)}
        className="absolute right-3 top-3 rounded-full p-2 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
        aria-label={t("plans.deleteAria")}
      >
        <BiTrash size={14} />
      </button>
    </article>
  );
}

export default function PlansPage() {
  const showAlert = alertStore((s) => s.show);
  const router = useRouter();
  const { data: plans = [], isLoading } = usePlans();
  const remove = useDeletePlan();
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const openPlan = plans.find((p) => Number(p.id) === openId);

  const handleDelete = async (id: number) => {
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const sortedPlans = useMemo(() => {
    return [...plans].sort((a, b) => {
      const sa = a.status ?? "";
      const sb = b.status ?? "";
      if (sa !== sb) {
        if (sa === "ACTIVE") return -1;
        if (sb === "ACTIVE") return 1;
      }
      const da = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
      const db = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
      if (da !== db) return da - db;
      const ia = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const ib = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ib - ia;
    });
  }, [plans]);

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("plans.title")}
        kicker={t("plans.kicker")}
        flourish={t("plans.flourish")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          {t("plans.introBefore")}{" "}
          <span className="font-instrument-serif italic text-husrev-ember dark:text-husrev-amber">
            {t("plans.introEm")}
          </span>{" "}
          {t("plans.introAfter")}
        </p>
        <button onClick={() => setShowModal(true)} className="husrev-btn">
          <BiPlus size={16} /> {t("plans.newPlan")}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-32 rounded-2xl ring-1 ring-husrev-sand/90 bg-white/60 animate-pulse dark:bg-husrev-shadow/60 dark:ring-white/[0.06]"
            />
          ))}
        </div>
      ) : sortedPlans.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl ring-1 ring-dashed ring-husrev-sand bg-husrev-cream/50 grain p-12 text-center dark:bg-husrev-shadow/60 dark:ring-white/[0.06]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
            <BiTargetLock size={22} />
          </div>
          <h3 className="mt-5 text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("plans.empty.title")}{" "}
            <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
              {t("plans.empty.flourish")}
            </span>{" "}
            {t("plans.empty.suffix")}
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            {t("plans.empty.bodyBefore")}{" "}
            <em className="font-instrument-serif">{t("plans.empty.bodyEm")}</em>
            {t("plans.empty.bodyAfter")}
          </p>
          <button onClick={() => setShowModal(true)} className="husrev-btn mt-6">
            <BiPlus size={16} /> {t("plans.empty.cta")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedPlans.map((p, i) => (
            <PlanCard
              key={p.id}
              plan={p}
              index={i}
              onDelete={handleDelete}
              onOpen={(id) => setOpenId(Number(id))}
            />
          ))}
        </div>
      )}

      {showModal && <NewPlanModal onClose={() => setShowModal(false)} />}

      <DetailModal
        isOpen={openId !== null}
        onClose={() => setOpenId(null)}
        onExpand={openId !== null ? () => router.push(`/plans/${openId}`) : undefined}
        title={openPlan?.title}
      >
        {openId !== null && (
          <PlanDetailPage id={openId} embedded onClose={() => setOpenId(null)} />
        )}
      </DetailModal>
    </div>
  );
}
