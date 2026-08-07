"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineMail, HiOutlineCheck } from "react-icons/hi";
import { useAddProjectMember } from "@/hooks/useProjects";
import { AddProjectMemberResponse, ProjectRole } from "@/types/project/project";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

type AddableRole = Exclude<ProjectRole, "OWNER">;

export default function AddMemberModal({
  projectId,
  onClose,
}: {
  projectId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const addMember = useAddProjectMember();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AddableRole>("EDITOR");
  const [result, setResult] = useState<AddProjectMemberResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await addMember.mutateAsync({
        id: projectId,
        body: { email: email.trim(), role },
      });
      setResult(res.data);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const copy = async () => {
    if (!result?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write may fail in non-secure contexts; ignore silently
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1 mb-5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("projects.members.addKicker", "Üye ekle")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("projects.members.addTitle", "Projeye üye ekle")}
          </h3>
        </div>

        {result ? (
          <AddMemberResult
            result={result}
            copied={copied}
            onCopy={copy}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="space-y-4">
              <Field label={t("projects.members.email", "E-posta")}>
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
              <Field label={t("projects.members.role", "Rol")}>
                <div className="grid grid-cols-2 gap-1 rounded-full bg-husrev-sand/50 p-1 dark:bg-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setRole("EDITOR")}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      role === "EDITOR"
                        ? "bg-husrev-ember text-husrev-cream"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {t("projects.roles.EDITOR", "Düzenleyici")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("VIEWER")}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      role === "VIEWER"
                        ? "bg-husrev-ember text-husrev-cream"
                        : "text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {t("projects.roles.VIEWER", "Görüntüleyici")}
                  </button>
                </div>
              </Field>
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                <HiOutlineMail className="inline-block h-3.5 w-3.5 mr-1" />
                {t(
                  "projects.members.addHint",
                  "Kullanıcının zaten bir hesabı varsa doğrudan projeye eklenir; yoksa 7 gün geçerli bir davet linki oluşturulur.",
                )}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={addMember.isPending}
                className="husrev-btn-ghost"
              >
                {t("common.cancel", "İptal")}
              </button>
              <button type="submit" disabled={!email.trim() || addMember.isPending} className="husrev-btn">
                {addMember.isPending
                  ? t("projects.members.adding", "Ekleniyor…")
                  : t("projects.members.addSubmit", "Üye ekle")}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function AddMemberResult({
  result,
  copied,
  onCopy,
  onClose,
}: {
  result: AddProjectMemberResponse;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  if (result.member) {
    const name =
      [result.member.firstName, result.member.lastName].filter(Boolean).join(" ") ||
      result.member.email;
    return (
      <div className="space-y-4">
        <div className="rounded-xl p-3 ring-1 text-sm bg-husrev-moss/10 ring-husrev-moss/30 text-husrev-moss">
          <HiOutlineCheck className="inline-block h-4 w-4 mr-1.5" />
          {t("projects.members.addedDirect", "{{name}} projeye eklendi.", { name })}
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="husrev-btn">
            {t("common.close", "Kapat")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl p-3 ring-1 text-sm ${
          result.emailDelivered
            ? "bg-husrev-moss/10 ring-husrev-moss/30 text-husrev-moss"
            : "bg-husrev-amber/15 ring-husrev-amber/30 text-husrev-ember"
        }`}
      >
        {result.emailDelivered
          ? t("projects.members.deliveredOk", "Davet e-postası başarıyla gönderildi.")
          : t(
              "projects.members.deliveredOff",
              "Sunucuda mail ayarlı değil — linki aşağıdan kopyalayıp kullanıcıya elden ulaştırabilirsin.",
            )}
      </div>

      <Field label={t("projects.members.inviteUrl", "Davet linki")}>
        <div className="flex gap-2">
          <input
            readOnly
            value={result.inviteUrl ?? ""}
            className="husrev-input flex-1 font-mono text-[12px]"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button type="button" onClick={onCopy} className="husrev-btn-ghost shrink-0">
            {copied ? (
              <>
                <HiOutlineCheck className="h-4 w-4" />
                {t("projects.members.copied", "Kopyalandı")}
              </>
            ) : (
              t("projects.members.copy", "Kopyala")
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
