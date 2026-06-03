"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import { HiSparkles } from "react-icons/hi2";
import { useCreateLoan, useDeleteLoan, useUpdateLoan } from "@/hooks/useFinance";
import { LoanRequest, LoanResponse, formatTRY } from "@/types/finance/finance";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

const NOTIFY_OPTIONS: [string, string][] = [
  ["", "Kapalı"],
  ["0", "Tam saatinde"],
  ["1440", "1 gün önce"],
  ["4320", "3 gün önce"],
  ["10080", "1 hafta önce"],
];

export function LoanModal({
  initial,
  onClose,
}: {
  initial: LoanResponse | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateLoan();
  const update = useUpdateLoan();
  const remove = useDeleteLoan();

  const locked = (initial?.paidCount ?? 0) > 0; // can't restructure after a payment

  const [name, setName] = useState(initial?.name ?? "");
  const [lender, setLender] = useState(initial?.lender ?? "");
  const [principal, setPrincipal] = useState(
    initial ? String(initial.principalAmount) : "",
  );
  const [count, setCount] = useState(
    initial ? String(initial.installmentCount) : "12",
  );
  const [installment, setInstallment] = useState(
    initial ? String(initial.installmentAmount) : "",
  );
  const [interestFree, setInterestFree] = useState(initial?.interestFree ?? true);
  const [interestRate, setInterestRate] = useState(
    initial?.interestRate != null && initial.interestRate > 0
      ? String(initial.interestRate)
      : "",
  );
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate));
  const [notify, setNotify] = useState<string>(
    initial?.notifyMinutesBefore != null ? String(initial.notifyMinutesBefore) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Even-split suggestion for interest-free plans.
  const suggested = useMemo(() => {
    const p = Number(principal);
    const c = Number(count);
    if (!Number.isFinite(p) || !Number.isFinite(c) || p <= 0 || c <= 0)
      return null;
    return Math.round((p / c) * 100) / 100;
  }, [principal, count]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(principal);
    const c = Number(count);
    const inst = Number(installment);
    if (!name.trim()) return;
    if (!Number.isFinite(p) || p <= 0) return;
    if (!Number.isInteger(c) || c < 1) return;
    if (!Number.isFinite(inst) || inst <= 0) return;
    const body: LoanRequest = {
      name: name.trim(),
      lender: lender.trim() || null,
      principalAmount: p,
      installmentCount: c,
      installmentAmount: inst,
      interestFree,
      interestRate: interestFree ? 0 : interestRate ? Number(interestRate) : null,
      startDate: new Date(startDate).toISOString(),
      notifyMinutesBefore: notify === "" ? null : Number(notify),
      notes: notes.trim() || null,
    };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, body });
      else await create.mutateAsync(body);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const confirmDelete = async () => {
    if (!initial) return;
    try {
      await remove.mutateAsync(initial.id);
      setConfirmingDelete(false);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const pending = create.isPending || update.isPending || remove.isPending;
  const totalPlanned = Number(installment) * Number(count);

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="space-y-1">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {initial
                ? t("finance.modal.editKicker", "Düzenle")
                : t("finance.modal.newKicker", "Yeni")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("finance.loan.title", "Kredi / Taksit")}
            </h3>
          </div>
          {initial && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
              aria-label={t("common.delete", "Sil")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
            >
              <BiTrash className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* Interest-free toggle — the owner's preferred option, shown first. */}
          <button
            type="button"
            onClick={() => setInterestFree((v) => !v)}
            aria-pressed={interestFree}
            className={`flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left ring-1 transition ${
              interestFree
                ? "bg-husrev-moss/12 ring-husrev-moss/30"
                : "bg-husrev-sand/40 ring-husrev-sand/70 dark:bg-white/[0.04] dark:ring-white/[0.06]"
            }`}
          >
            <span className="flex items-center gap-2">
              <HiSparkles
                className={`h-4 w-4 ${interestFree ? "text-husrev-moss" : "text-gray-400"}`}
              />
              <span className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                {t("finance.loan.interestFree", "Faizsiz")}
              </span>
            </span>
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                interestFree ? "bg-husrev-moss" : "bg-gray-300 dark:bg-white/20"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  interestFree ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>

          <Field label={t("finance.loan.name", "Ad")}>
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="husrev-input"
              autoFocus
              placeholder={t("finance.loan.namePlaceholder", "Telefon taksiti")}
            />
          </Field>

          <Field label={t("finance.loan.lender", "Kurum / mağaza")}>
            <input
              maxLength={160}
              value={lender}
              onChange={(e) => setLender(e.target.value)}
              className="husrev-input"
              placeholder={t("finance.loan.lenderPlaceholder", "Garanti BBVA")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("finance.loan.principal", "Toplam tutar (₺)")}>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                disabled={locked}
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                className="husrev-input tabular-nums disabled:opacity-60"
              />
            </Field>
            <Field label={t("finance.loan.count", "Taksit sayısı")}>
              <input
                type="number"
                step="1"
                min="1"
                required
                disabled={locked}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="husrev-input tabular-nums disabled:opacity-60"
              />
            </Field>
          </div>

          <Field label={t("finance.loan.installment", "Aylık taksit (₺)")}>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              disabled={locked}
              value={installment}
              onChange={(e) => setInstallment(e.target.value)}
              className="husrev-input tabular-nums disabled:opacity-60"
            />
            {!locked && suggested != null && Number(installment) !== suggested && (
              <button
                type="button"
                onClick={() => setInstallment(String(suggested))}
                className="mt-1 text-[11px] text-husrev-ember hover:underline dark:text-husrev-amber"
              >
                {t("finance.loan.evenSplit", "Eşit böl")}: {formatTRY(suggested)}
              </button>
            )}
          </Field>

          {!interestFree && (
            <Field label={t("finance.loan.interestRate", "Faiz oranı (%)")}>
              <input
                type="number"
                step="0.01"
                min="0"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="husrev-input tabular-nums"
                placeholder="0,00"
              />
            </Field>
          )}

          <Field label={t("finance.loan.startDate", "İlk taksit tarihi")}>
            <input
              type="date"
              required
              disabled={locked}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="husrev-input disabled:opacity-60"
            />
          </Field>

          <Field label={t("finance.field.notifyBefore", "Hatırlatma")}>
            <div className="flex flex-wrap gap-1.5">
              {NOTIFY_OPTIONS.map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setNotify(val)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    notify === val
                      ? "bg-husrev-ember text-husrev-cream"
                      : "bg-husrev-sand/50 text-gray-700 hover:bg-husrev-amber/15 dark:bg-white/[0.06] dark:text-gray-300"
                  }`}
                >
                  {t(`finance.notify.${val || "off"}`, label)}
                </button>
              ))}
            </div>
          </Field>

          {locked && (
            <p className="rounded-xl bg-husrev-amber/10 p-3 text-[11px] text-husrev-ember ring-1 ring-husrev-amber/20 dark:text-husrev-amber">
              {t(
                "finance.loan.lockedNote",
                "Ödeme yapıldıktan sonra taksit planı değiştirilemez. Planı değiştirmek için krediyi silip yeniden oluştur.",
              )}
            </p>
          )}

          {Number.isFinite(totalPlanned) && totalPlanned > 0 && (
            <div className="rounded-xl bg-husrev-cream/40 p-3 text-xs text-gray-600 ring-1 ring-husrev-sand/60 dark:bg-white/[0.03] dark:text-gray-300 dark:ring-white/[0.06]">
              {t("finance.loan.totalPlanned", "Toplam ödeme")}:{" "}
              <span className="tabular-nums font-semibold text-husrev-ink dark:text-husrev-cream">
                {formatTRY(totalPlanned)}
              </span>{" "}
              ({count} × {formatTRY(Number(installment) || 0)})
            </div>
          )}

          <Field label={t("finance.field.notes", "Not")}>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="husrev-input resize-none"
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel", "İptal")}
          </button>
          <button type="submit" disabled={pending} className="husrev-btn">
            {pending
              ? t("common.saving", "Kaydediliyor…")
              : initial
                ? t("common.save", "Kaydet")
                : t("common.create", "Oluştur")}
          </button>
        </div>
      </form>

      <DeleteConfirmModal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
        isPending={remove.isPending}
        title={t("finance.loan.confirmDeleteTitle", "Krediyi sil")}
        message={t(
          "finance.loan.confirmDelete",
          "Bu krediyi ve tüm taksitlerini silmek istediğine emin misin?",
        )}
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="husrev-kicker text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}
