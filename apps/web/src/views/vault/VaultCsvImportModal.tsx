"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BiCheckCircle, BiErrorCircle, BiFile, BiUpload } from "react-icons/bi";
import { vaultService } from "@/services/vault-service";
import { parseAxiosError } from "@/utils/handleError";
import { ImportResultDto } from "@/types/vault/vault";

interface VaultCsvImportModalProps {
  entityId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

const ACCEPTED_EXTENSION = ".csv";

function isCsvFile(file: File): boolean {
  return (
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.name.toLowerCase().endsWith(ACCEPTED_EXTENSION)
  );
}

/**
 * Modal for bulk-importing vault items from a CSV file (columns: name, url,
 * username, password). Self-contained — the caller just toggles `isOpen`.
 */
export default function VaultCsvImportModal({
  entityId,
  isOpen,
  onClose,
  onSuccess,
}: VaultCsvImportModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [isDragActive, setIsDragActive] = useState(false);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importMutation = useMutation({
    mutationFn: () => vaultService.importCsv(entityId, file as File, skipDuplicates),
    onSuccess: (res) => {
      setResult(res.data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["vault-items"] });
      queryClient.invalidateQueries({ queryKey: ["vault-entities"] });
    },
    onError: (err) => {
      const { message } = parseAxiosError(err);
      setError(message || t("vault.importCsv.error"));
    },
  });

  // Reset local state whenever the modal is (re)opened.
  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setSkipDuplicates(true);
    setIsDragActive(false);
    setResult(null);
    setError(null);
    importMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const pickFile = (candidate: File | null) => {
    if (!candidate) return;
    if (!isCsvFile(candidate)) {
      setError(t("vault.importCsv.error"));
      return;
    }
    setError(null);
    setResult(null);
    setFile(candidate);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  };

  const handleImport = () => {
    if (!file) {
      setError(t("vault.importCsv.selectFileFirst"));
      return;
    }
    setError(null);
    importMutation.mutate();
  };

  const handleDone = () => {
    if (result) onSuccess?.(result.successCount);
    onClose();
  };

  const loading = importMutation.isPending;
  const hasErrors = !!result?.errors?.length;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={() => !loading && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vault-csv-import-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("vault.importCsv.kicker")}
          </span>
          <h3
            id="vault-csv-import-title"
            className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream"
          >
            {t("vault.importCsv.title")}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t("vault.importCsv.hint")}</p>
        </div>

        {!result && (
          <div className="mt-6 space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                isDragActive
                  ? "border-husrev-amber bg-husrev-amber/5"
                  : "border-gray-200 hover:border-husrev-amber/60 dark:border-gray-700"
              }`}
            >
              {file ? (
                <>
                  <BiFile size={28} className="text-husrev-ember dark:text-husrev-amber" />
                  <span className="max-w-full truncate text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                    {file.name}
                  </span>
                  <span className="text-xs text-gray-400 underline">
                    {t("vault.importCsv.changeFile")}
                  </span>
                </>
              ) : (
                <>
                  <BiUpload size={28} className="text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {isDragActive
                      ? t("vault.importCsv.dropzoneActive")
                      : t("vault.importCsv.dropzone")}
                  </span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={`${ACCEPTED_EXTENSION},text/csv`}
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-husrev-amber focus:ring-husrev-amber"
              />
              {t("vault.importCsv.skipDuplicates")}
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-error-50 px-3 py-2 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-400">
                <BiErrorCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-2 rounded-xl bg-success-50 px-3 py-2 text-sm text-success-600 dark:bg-success-500/10 dark:text-success-400">
              <BiCheckCircle size={16} className="mt-0.5 shrink-0" />
              <span>
                {t("vault.importCsv.success", {
                  successCount: result.successCount,
                  skippedCount: result.skippedCount,
                  totalRows: result.totalRows,
                })}
              </span>
            </div>

            {hasErrors && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <span className="husrev-kicker text-gray-500 dark:text-gray-400">
                  {t("vault.importCsv.errorsTitle")}
                </span>
                <ul className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {result.errors.map((rowError, idx) => (
                    <li key={`${rowError.row}-${idx}`}>
                      {t("vault.importCsv.errorRow", {
                        row: rowError.row,
                        message: rowError.message,
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          {result ? (
            <button type="button" onClick={handleDone} className="husrev-btn">
              {t("vault.importCsv.done")}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="husrev-btn-ghost"
              >
                {t("vault.importCsv.cancel")}
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={!file || loading}
                className="husrev-btn"
              >
                {loading ? t("vault.importCsv.importing") : t("vault.importCsv.import")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
