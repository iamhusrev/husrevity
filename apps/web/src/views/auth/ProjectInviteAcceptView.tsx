"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { projectInvitePublicService } from "@/services/project-service";
import { AuthService } from "@/services/auth-service";
import { useAuth } from "@/providers/AuthProvider";
import { ProjectInviteLookup } from "@/types/project/project";
import { LOGIN_PAGE } from "@/utils/constants-url";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

type State =
  | { phase: "loading" }
  | { phase: "ready"; invite: ProjectInviteLookup }
  | { phase: "error"; message: string };

export default function ProjectInviteAcceptView({ token }: { token: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, isAuthenticated, applyUser, logout } = useAuth();
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
        const res = await projectInvitePublicService.lookup(token);
        if (cancelled) return;
        setState({ phase: "ready", invite: res.data });
      } catch (err) {
        if (cancelled) return;
        const { message } = parseAxiosError(err);
        setState({
          phase: "error",
          message: message || t("projectInvite.invalid", "Davet bulunamadı veya süresi doldu."),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      showAlert({
        title: t("common.error"),
        message: t("projectInvite.passwordTooShort", "Şifre en az 8 karakter olmalı."),
        type: "error",
        position: "top-center",
      });
      return;
    }
    if (password !== confirmPassword) {
      showAlert({
        title: t("common.error"),
        message: t("projectInvite.passwordMismatch", "Şifreler aynı değil."),
        type: "error",
        position: "top-center",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await projectInvitePublicService.register(token, {
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      });
      const auth = res.data;
      AuthService.persistAuth(auth);
      applyUser(auth.user);
      router.replace("/projects");
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setSubmitting(false);
    }
  };

  const submitAccept = async () => {
    setSubmitting(true);
    try {
      const res = await projectInvitePublicService.accept(token);
      router.replace(`/projects/${res.data.projectId}`);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setSubmitting(false);
    }
  };

  const emailMismatch =
    state.phase === "ready" &&
    isAuthenticated &&
    !!user?.email &&
    user.email.toLowerCase() !== state.invite.email.toLowerCase();

  return (
    <div className="min-h-dvh bg-husrev-cream dark:bg-husrev-ink grain flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("projectInvite.kicker", "Proje daveti")}
          </span>
          <h1 className="mt-2 text-[28px] md:text-[32px] leading-tight font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("projectInvite.titlePrefix", "Projeye")}{" "}
            <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
              {t("projectInvite.titleFlourish", "katıl")}
            </span>
          </h1>
        </div>

        <div className="rounded-3xl ring-1 ring-husrev-sand/90 bg-white p-7 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06] husrev-settle">
          {state.phase === "loading" && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-husrev-sand/40 motion-safe:animate-pulse" />
              ))}
            </div>
          )}

          {state.phase === "error" && (
            <div className="text-center space-y-3">
              <p className="text-sm text-error-500">{state.message}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t(
                  "projectInvite.errorHint",
                  "Davet edenle iletişime geç ve yeni bir link iste.",
                )}
              </p>
            </div>
          )}

          {state.phase === "ready" && (
            <div className="space-y-4">
              <div className="rounded-xl bg-husrev-cream/50 p-3 ring-1 ring-husrev-sand/60 dark:bg-white/[0.03] dark:ring-white/[0.06]">
                <div className="husrev-kicker text-gray-500 dark:text-gray-400 mb-1">
                  {t("projectInvite.project", "Proje")}
                </div>
                <div className="font-mono text-sm text-husrev-ink dark:text-husrev-cream">
                  {state.invite.projectName} ({state.invite.projectCode})
                </div>
                <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  {t(
                    "projectInvite.invitedBy",
                    "{{by}} tarafından {{role}} olarak davet edildin · son geçerlilik: {{date}}",
                    {
                      by: state.invite.invitedByEmail,
                      role: t(`projects.roles.${state.invite.role}`),
                      date: new Date(state.invite.expiresAt).toLocaleString("tr-TR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    },
                  )}
                </div>
                <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {t("projectInvite.invitedAs", "Davet edilen e-posta: {{email}}", {
                    email: state.invite.email,
                  })}
                </div>
              </div>

              {state.invite.requiresRegistration ? (
                <form onSubmit={submitRegister} className="space-y-4">
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

                  <Field label={t("projectInvite.password", "Şifre")}>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="husrev-input"
                      autoComplete="new-password"
                      placeholder={t("projectInvite.passwordPlaceholder", "En az 8 karakter")}
                    />
                  </Field>
                  <Field label={t("projectInvite.confirmPassword", "Şifre tekrar")}>
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
                      ? t("projectInvite.creating", "Hesap oluşturuluyor…")
                      : t("projectInvite.submitRegister", "Hesap oluştur ve katıl")}
                  </button>
                </form>
              ) : isAuthenticated ? (
                emailMismatch ? (
                  <div className="space-y-3">
                    <p className="text-sm text-husrev-ember dark:text-husrev-amber">
                      {t(
                        "projectInvite.wrongAccount",
                        "Bu davet {{email}} adresine gönderildi, o hesapla giriş yap.",
                        { email: state.invite.email },
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="husrev-btn-ghost w-full justify-center"
                    >
                      {t("projectInvite.logoutAndSwitch", "Çıkış yap ve başka hesapla dene")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={submitAccept}
                    disabled={submitting}
                    className="husrev-btn w-full justify-center"
                  >
                    {submitting
                      ? t("projectInvite.accepting", "Katılıyorsun…")
                      : t("projectInvite.submitAccept", "Daveti kabul et")}
                  </button>
                )
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t(
                      "projectInvite.loginHint",
                      "{{email}} adresiyle zaten bir hesabın var. Devam etmek için o hesapla giriş yap.",
                      { email: state.invite.email },
                    )}
                  </p>
                  <Link href={LOGIN_PAGE} className="husrev-btn w-full justify-center">
                    {t("projectInvite.goToLogin", "Giriş yap")}
                  </Link>
                </div>
              )}
            </div>
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
