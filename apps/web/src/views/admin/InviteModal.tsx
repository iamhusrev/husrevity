"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineMail, HiOutlineCheck } from "react-icons/hi";
import { useCreateInvite } from "@/hooks/useAdmin";
import { Role } from "@/types/admin/admin";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

export function InviteModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const create = useCreateInvite();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [result, setResult] = useState<
    | null
    | {
        inviteUrl: string;
        emailDelivered: boolean;
      }
  >(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({
        email: email.trim(),
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        role,
      });
      setResult({
        inviteUrl: res.data.inviteUrl,
        emailDelivered: res.data.emailDelivered,
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write may fail in non-secure contexts; ignore silently
    }
  };

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1 mb-5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("admin.invites.kicker", "Yeni davet")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("admin.invites.title", "Kullanıcı davet et")}
          </h3>
        </div>

        {result ? (
          <ResultPanel
            inviteUrl={result.inviteUrl}
            emailDelivered={result.emailDelivered}
            copied={copied}
            onCopy={copy}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="space-y-4">
              <Field label={t("admin.invites.email", "E-posta")}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="husrev-input"
                  autoFocus
                  placeholder="kullanici@ornek.com"
                />
              </Field>
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
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      role === "user" ? "bg-husrev-ember text-husrev-cream" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {t("admin.role.user", "Kullanıcı")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("admin")}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      role === "admin" ? "bg-husrev-ember text-husrev-cream" : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {t("admin.role.admin", "Yönetici")}
                  </button>
                </div>
              </Field>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                <HiOutlineMail className="inline-block h-3.5 w-3.5 mr-1" />
                {t(
                  "admin.invites.hint",
                  "7 gün geçerli bir davet linki gönderilir. Sunucuda SMTP ayarlı değilse linki sana göstereceğiz.",
                )}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} disabled={create.isPending} className="husrev-btn-ghost">
                {t("common.cancel", "İptal")}
              </button>
              <button type="submit" disabled={create.isPending} className="husrev-btn">
                {create.isPending
                  ? t("admin.invites.sending", "Gönderiliyor…")
                  : t("admin.invites.submit", "Davet oluştur")}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function ResultPanel({
  inviteUrl,
  emailDelivered,
  copied,
  onCopy,
  onClose,
}: {
  inviteUrl: string;
  emailDelivered: boolean;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl p-3 ring-1 text-sm ${
          emailDelivered
            ? "bg-husrev-moss/10 ring-husrev-moss/30 text-husrev-moss"
            : "bg-husrev-amber/15 ring-husrev-amber/30 text-husrev-ember"
        }`}
      >
        {emailDelivered
          ? t("admin.invites.deliveredOk", "Davet e-postası başarıyla gönderildi.")
          : t(
              "admin.invites.deliveredOff",
              "Sunucuda mail ayarlı değil — linki aşağıdan kopyalayıp kullanıcıya elden ulaştırabilirsin.",
            )}
      </div>

      <Field label={t("admin.invites.inviteUrl", "Davet linki")}>
        <div className="flex gap-2">
          <input
            readOnly
            value={inviteUrl}
            className="husrev-input flex-1 font-mono text-[12px]"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            type="button"
            onClick={onCopy}
            className="husrev-btn-ghost shrink-0"
          >
            {copied ? (
              <>
                <HiOutlineCheck className="h-4 w-4" />
                {t("admin.invites.copied", "Kopyalandı")}
              </>
            ) : (
              t("admin.invites.copy", "Kopyala")
            )}
          </button>
        </div>
      </Field>

      <div className="mt-6 flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="husrev-btn">
          {t("common.close", "Kapat")}
        </button>
      </div>
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
