"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { invitePublicService } from "@/services/admin-service";
import { AuthService } from "@/services/auth-service";
import { useAuth } from "@/providers/AuthProvider";
import { InviteLookup } from "@/types/admin/admin";
import { HOME_PAGE } from "@/utils/constants-url";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

type State =
  | { phase: "loading" }
  | { phase: "ready"; invite: InviteLookup }
  | { phase: "error"; message: string };

export default function InviteAcceptView({ token }: { token: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { applyUser } = useAuth();
  const showAlert = alertStore((s) => s.show);

  const [state, setState] = useState<State>({ phase: "loading" });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await invitePublicService.lookup(token);
        if (cancelled) return;
        setState({ phase: "ready", invite: res.data });
        setFirstName(res.data.firstName ?? "");
        setLastName(res.data.lastName ?? "");
      } catch (err) {
        if (cancelled) return;
        const { message } = parseAxiosError(err);
        setState({
          phase: "error",
          message:
            message ||
            t("invite.invalid", "Davet bulunamadı veya süresi doldu."),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      showAlert({
        title: t("common.error"),
        message: t("invite.passwordTooShort", "Şifre en az 8 karakter olmalı."),
        type: "error",
        position: "top-center",
      });
      return;
    }
    if (password !== confirmPassword) {
      showAlert({
        title: t("common.error"),
        message: t("invite.passwordMismatch", "Şifreler aynı değil."),
        type: "error",
        position: "top-center",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await invitePublicService.accept(token, {
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      const auth = res.data;
      AuthService.persistAuth(auth);
      applyUser(auth.user);
      router.replace(HOME_PAGE);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-husrev-cream dark:bg-husrev-ink grain flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("invite.kicker", "Husrevity'ye davet")}
          </span>
          <h1 className="mt-2 text-[28px] md:text-[32px] leading-tight font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("invite.titlePrefix", "Hesabını")}{" "}
            <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
              {t("invite.titleFlourish", "oluştur")}
            </span>
          </h1>
        </div>

        <div className="rounded-3xl ring-1 ring-husrev-sand/90 bg-white p-7 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06] husrev-settle">
          {state.phase === "loading" && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-10 rounded-xl bg-husrev-sand/40 motion-safe:animate-pulse"
                />
              ))}
            </div>
          )}

          {state.phase === "error" && (
            <div className="text-center space-y-3">
              <p className="text-sm text-error-500">{state.message}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "invite.errorHint",
                  "Davet edenle iletişime geç ve yeni bir link iste.",
                )}
              </p>
            </div>
          )}

          {state.phase === "ready" && (
            <form onSubmit={submit} className="space-y-4">
              <div className="rounded-xl bg-husrev-cream/50 p-3 ring-1 ring-husrev-sand/60 dark:bg-white/[0.03] dark:ring-white/[0.06]">
                <div className="husrev-kicker text-gray-500 dark:text-gray-400 mb-1">
                  {t("invite.invitedAs", "Davet edilen e-posta")}
                </div>
                <div className="font-mono text-sm text-husrev-ink dark:text-husrev-cream">
                  {state.invite.email}
                </div>
                <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  {t("invite.invitedBy", "{{by}} tarafından davet edildi · son geçerlilik: {{date}}", {
                    by: state.invite.invitedByEmail,
                    date: new Date(state.invite.expiresAt).toLocaleString("tr-TR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }),
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("profile.firstName", "Ad")}>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="husrev-input"
                    autoComplete="given-name"
                  />
                </Field>
                <Field label={t("profile.lastName", "Soyad")}>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="husrev-input"
                    autoComplete="family-name"
                  />
                </Field>
              </div>

              <Field label={t("invite.password", "Şifre")}>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="husrev-input"
                  autoComplete="new-password"
                  placeholder={t("invite.passwordPlaceholder", "En az 8 karakter")}
                />
              </Field>
              <Field label={t("invite.confirmPassword", "Şifre tekrar")}>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="husrev-input"
                  autoComplete="new-password"
                />
              </Field>

              <button type="submit" disabled={submitting} className="husrev-btn w-full justify-center">
                {submitting
                  ? t("invite.creating", "Hesap oluşturuluyor…")
                  : t("invite.submit", "Davete katıl")}
              </button>
            </form>
          )}
        </div>
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
