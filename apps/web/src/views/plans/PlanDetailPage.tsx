"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  useCreatePlanItem,
  useDeletePlanItem,
  usePlan,
  usePlanItems,
  useUpdatePlanItem,
} from "@/hooks/usePlans";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatDate } from "@/utils/i18n-date";
import { BiPlus, BiTrash, BiArrowBack } from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";
import { PlanItemResponse } from "@/types/plan/plan";

function PlanItemRow({ item, planId }: { item: PlanItemResponse; planId: number }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const update = useUpdatePlanItem();
  const remove = useDeletePlanItem();

  const handleToggle = async () => {
    try {
      await update.mutateAsync({
        id: item.id,
        planId,
        body: {
          title: item.title,
          done: !item.done,
          targetDate: item.targetDate,
          orderIndex: item.orderIndex,
        },
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync({ id: item.id, planId });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="group flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-gray-50 dark:hover:bg-gray-800">
      <button
        type="button"
        onClick={handleToggle}
        className="shrink-0 text-gray-400 transition hover:text-brand-500"
        aria-label={item.done ? t("lists.toggle.complete") : t("lists.toggle.incomplete")}
      >
        {item.done ? (
          <BsCheckCircleFill size={18} className="text-brand-500" />
        ) : (
          <BsCircle size={18} />
        )}
      </button>
      <div className="flex flex-1 flex-col min-w-0">
        <span
          className={`truncate text-sm ${
            item.done
              ? "line-through text-gray-400 dark:text-gray-500"
              : "text-gray-800 dark:text-white/90"
          }`}
        >
          {item.title}
        </span>
        {item.targetDate && (
          <span className="text-xs text-gray-400">{formatDate(item.targetDate)}</span>
        )}
      </div>
      <button
        type="button"
        onClick={handleDelete}
        className="rounded-full p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
        aria-label={t("common.delete")}
      >
        <BiTrash size={14} />
      </button>
    </div>
  );
}

export default function PlanDetailPage({
  id,
  embedded,
}: {
  id: number;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const { data: plan } = usePlan(id);
  const { data: items = [], isLoading } = usePlanItems(id);
  const create = useCreatePlanItem();

  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sorted = [...items].sort((a, b) => a.orderIndex - b.orderIndex);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ planId: id, body: { title: trimmed } });
      setTitle("");
      inputRef.current?.focus();
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

  if (id <= 0) return <p className="p-6 text-gray-500">{t("plans.invalid")}</p>;

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/plans")}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={t("common.back")}
          >
            <BiArrowBack size={18} />
          </button>
          <PageBreadcrumb pageTitle={plan?.title ?? t("plans.fallbackTitle")} />
        </div>
      )}

      {plan?.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{plan.description}</p>
      )}

      <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <form onSubmit={handleAdd} className="mb-4 flex gap-2">
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("plans.newItemPlaceholder")}
            className="husrev-input flex-1"
          />
          <button
            type="submit"
            disabled={!title.trim() || create.isPending}
            className="husrev-btn shrink-0 px-4"
            aria-label={t("common.add")}
          >
            <BiPlus size={18} />
          </button>
        </form>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-gray-400">{t("common.loading")}</p>
        ) : sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">{t("plans.noItems")}</p>
        ) : (
          <div className="space-y-0.5">
            {sorted.map((item) => (
              <PlanItemRow key={item.id} item={item} planId={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
