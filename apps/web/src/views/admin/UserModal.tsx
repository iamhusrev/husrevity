"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BiTrash } from "react-icons/bi";
import {
  useDeleteAdminUser,
  useResetAdminUserPassword,
  useUpdateAdminUser,
} from "@/hooks/useAdmin";
import { AdminUser, Role } from "@/types/admin/admin";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";

export function UserModal({
  initial,
  isSelf,
  onClose,
}: {
  initial: AdminUser;
  isSelf: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const update = useUpdateAdminUser();
  const resetPwd = useResetAdminUserPassword();
  const remove = useDeleteAdminUser();

  const [firstName, setFirstName] = useState(initial.firstName ?? "");
  const [lastName, setLastName] = useState(initial.lastName ?? "");
  const [role, setRole] = useState<Role>(initial.role as Role);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [newPassword, setNewPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update.mutateAsync({
        id: initial.id,
        body: {
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          role,
          enabled,
        },
      });
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const doResetPassword = async () => {
    if (newPassword.length < 8) {
      showAlert({
        title: t("common.error"),
        message: t("admin.users.passwordTooShort", "Şifre en az 8 karakter olmalı."),
        type: "error",
        position: "top-center",
      });
      return;
    }
    try {
      await resetPwd.mutateAsync({ id: initial.id, body: { newPassword } });
      setNewPassword("");
      showAlert({
        title: t("common.saved", "Kaydedildi"),
        message: t("admin.users.passwordReset", "Şifre güncellendi."),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const openDelete = () => {
    if (isSelf) return;
    setConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(initial.id);
      setConfirmingDelete(false);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const pending = update.isPending || resetPwd.isPending || remove.isPending;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        className="w-full max-w-lg rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="space-y-1 min-w-0">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {t("admin.users.modalKicker", "Kullanıcı")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream truncate">
              {initial.email}
            </h3>
          </div>
          {!isSelf && (
            <button
              type="button"
              onClick={openDelete}
              disabled={pending}
              aria-label={t("common.delete", "Sil")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
            >
              <BiTrash className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("profile.firstName", "Ad")}>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="husrev-input"
              />
            </Field>
            <Field label={t("profile.lastName", "Soyad")}>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="husrev-input"
              />
            </Field>
          </div>

          <Field label={t("admin.users.col.role", "Rol")}>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-husrev-sand/50 p-1 dark:bg-white/[0.06]">
              <button
                type="button"
                onClick={() => setRole("user")}
                disabled={isSelf}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                  role === "user"
                    ? "bg-husrev-ember text-husrev-cream"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {t("admin.role.user", "Kullanıcı")}
              </button>
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  role === "admin"
                    ? "bg-husrev-ember text-husrev-cream"
                    : "text-gray-600 dark:text-gray-300"
                }`}
              >
                {t("admin.role.admin", "Yönetici")}
              </button>
            </div>
            {isSelf && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {t("admin.users.cannotDemoteSelf", "Kendi rolünü düşüremezsin.")}
              </p>
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={enabled}
              disabled={isSelf}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-husrev-sand text-husrev-ember focus:ring-husrev-amber"
            />
            {t("admin.users.enabled", "Hesap aktif")}
          </label>

          <div className="rounded-xl bg-husrev-cream/40 p-3 ring-1 ring-husrev-sand/60 dark:bg-white/[0.03] dark:ring-white/[0.06] space-y-2">
            <div className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("admin.users.resetPasswordTitle", "Şifre sıfırla")}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("admin.users.newPasswordPlaceholder", "Yeni şifre…")}
                className="husrev-input flex-1"
                minLength={8}
              />
              <button
                type="button"
                onClick={doResetPassword}
                disabled={pending || newPassword.length < 8}
                className="husrev-btn-ghost shrink-0"
              >
                {t("admin.users.resetButton", "Sıfırla")}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="husrev-btn-ghost">
            {t("common.cancel", "İptal")}
          </button>
          <button type="submit" disabled={pending} className="husrev-btn">
            {pending ? t("common.saving", "Kaydediliyor…") : t("common.save", "Kaydet")}
          </button>
        </div>
      </form>

      <DeleteConfirmModal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
        isPending={remove.isPending}
        title={t("admin.users.confirmDeleteTitle", "Kullanıcıyı sil")}
        message={t(
          "admin.users.confirmDelete",
          "Bu kullanıcıyı silmek istediğine emin misin?",
        )}
      />
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
