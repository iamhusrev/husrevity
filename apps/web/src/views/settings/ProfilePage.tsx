"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import { useAuth } from "@/providers/AuthProvider";
import { AuthService } from "@/services/auth-service";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import {
  BiEnvelope,
  BiIdCard,
  BiUser,
  BiCheckCircle,
  BiPauseCircle,
  BiEdit,
  BiLockAlt,
  BiSave,
  BiBell,
} from "react-icons/bi";

function getInitials(
  firstName: string | null,
  lastName: string | null,
  email: string,
  fallback: string,
): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  if (f || l) {
    return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || fallback;
  }
  const local = email.split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || fallback;
}

export default function ProfilePage() {
  const { user, applyUser } = useAuth();
  const { t } = useTranslation();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageBreadcrumb
          pageTitle={t("profile.title")}
          kicker={t("profile.kicker")}
          flourish={t("profile.flourish")}
        />
        <div className="rounded-3xl ring-1 ring-husrev-sand/90 bg-white/60 p-10 text-center text-gray-400 dark:bg-husrev-shadow/60 dark:ring-white/[0.06]">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  const firstName = (user.firstName ?? "").trim();
  const lastName = (user.lastName ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const displayName = fullName || t("profile.namePlaceholder");
  const initials = getInitials(
    user.firstName,
    user.lastName,
    user.email,
    t("profile.fallbackInitial"),
  );
  const isActive = !!user.enabled;
  const StatusIcon = isActive ? BiCheckCircle : BiPauseCircle;

  return (
    <div className="space-y-7">
      <PageBreadcrumb
        pageTitle={t("profile.title")}
        kicker={t("profile.kicker")}
        flourish={t("profile.flourish")}
      />

      {/* Identity hero */}
      <section className="relative overflow-hidden rounded-3xl ring-1 ring-husrev-sand/90 bg-gradient-to-br from-white via-husrev-cream/60 to-husrev-sand/40 p-7 md:p-9 grain dark:from-husrev-shadow dark:via-husrev-ink dark:to-husrev-shadow dark:ring-white/[0.06] husrev-settle">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-husrev-amber/10 blur-3xl dark:bg-husrev-amber/15" />
        <div className="pointer-events-none absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-husrev-moss/10 blur-3xl dark:bg-husrev-moss/15" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:gap-8">
          {/* Avatar with initials */}
          <div className="relative shrink-0">
            <div className="flex h-24 w-24 md:h-28 md:w-28 items-center justify-center rounded-3xl bg-gradient-to-br from-husrev-amber to-husrev-ember text-husrev-cream shadow-card-warm">
              <span className="font-instrument-serif italic text-5xl md:text-6xl leading-none tabular-nums select-none">
                {initials}
              </span>
            </div>
            <span
              className={`absolute -bottom-1.5 -right-1.5 flex h-7 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] ring-2 ring-white dark:ring-husrev-ink ${
                isActive
                  ? "bg-husrev-moss/20 text-husrev-moss dark:bg-husrev-moss/30 dark:text-husrev-cream"
                  : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              }`}
            >
              <StatusIcon size={12} />
              {isActive ? t("profile.active") : t("profile.inactive")}
            </span>
          </div>

          {/* Identity copy */}
          <div className="flex-1 min-w-0 space-y-3">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {t("profile.accountInfo")}
            </span>
            <h2 className="text-[30px] md:text-[38px] leading-[1.05] tracking-tight font-semibold text-husrev-ink dark:text-husrev-cream">
              {firstName ? (
                <>
                  <span className="font-instrument-serif italic font-normal word-underline">
                    {firstName}
                  </span>
                  {lastName ? ` ${lastName}` : ""}
                </>
              ) : (
                displayName
              )}
            </h2>
            <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <BiEnvelope size={14} className="shrink-0 text-husrev-ember dark:text-husrev-amber" />
              <span className="font-mono text-[13px] truncate">{user.email}</span>
            </p>
            <p className="max-w-xl text-[14px] leading-relaxed text-gray-500 dark:text-gray-400">
              {t("profile.introBefore")}{" "}
              <span className="font-instrument-serif italic text-husrev-ember dark:text-husrev-amber">
                {t("profile.introEm")}
              </span>{" "}
              {t("profile.introAfter")}
            </p>
          </div>
        </div>

        <div className="husrev-rule husrev-shimmer mt-7" />
      </section>

      {/* Account details */}
      <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-6 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <header className="mb-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="husrev-kicker text-gray-400 dark:text-gray-500">
                {t("profile.accountInfo")}
              </span>
              <h3 className="text-base font-semibold text-husrev-ink dark:text-husrev-cream">
                {t("profile.title")}
              </h3>
            </div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
              <BiUser size={18} />
            </div>
          </header>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <FieldRow
              icon={<BiIdCard size={14} />}
              label={t("profile.userIdLabel")}
              value={<span className="font-mono tabular-nums">{user.id}</span>}
            />
            <FieldRow
              icon={<BiUser size={14} />}
              label={t("profile.firstName")}
              value={firstName || "—"}
              muted={!firstName}
            />
            <FieldRow
              icon={<BiUser size={14} />}
              label={t("profile.lastName")}
              value={lastName || "—"}
              muted={!lastName}
            />
            <FieldRow
              icon={<BiEnvelope size={14} />}
              label={t("profile.email")}
              value={<span className="font-mono text-[13px]">{user.email}</span>}
            />
            <FieldRow
              icon={<StatusIcon size={14} />}
              label={t("profile.status")}
              value={
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-[0.08em] ${
                    isActive
                      ? "bg-husrev-moss/15 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isActive ? "bg-husrev-moss" : "bg-gray-400"
                    }`}
                  />
                  {isActive ? t("profile.active") : t("profile.inactive")}
                </span>
              }
            />
          </dl>
        </section>

      <EditCards
        initialFirstName={user.firstName ?? ""}
        initialLastName={user.lastName ?? ""}
      />

      <NotificationPreferences />
    </div>
  );
}

/**
 * Email-notifications opt-in toggle. Backend dispatcher gates each email
 * delivery on `user.emailNotificationsEnabled` AND SMTP being configured, so
 * the toggle is purely user intent — flipping it on without server-side
 * MAIL_USER+MAIL_PASS results in a silent no-op (in-app bell + web-push still
 * fire). The hint text says so explicitly to avoid the "I turned it on, where
 * are my mails" confusion.
 */
function NotificationPreferences() {
  const { t } = useTranslation();
  const { user, applyUser } = useAuth();
  const showAlert = alertStore((s) => s.show);
  const initial = Boolean(user?.emailNotificationsEnabled);
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    if (saving) return;
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    try {
      const updated = await AuthService.updateNotificationPreferences({
        email: next,
      });
      applyUser(updated);
      showAlert({
        title: t("profile.saved"),
        message: next
          ? t("settings.notifications.emailEnabledHint")
          : t("settings.notifications.emailDisabledHint"),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      setEnabled(initial); // rollback
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-6 dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <header className="mb-4 flex items-center justify-between">
        <div className="space-y-1">
          <span className="husrev-kicker text-gray-400 dark:text-gray-500">
            {t("settings.notifications.kicker", "Bildirimler")}
          </span>
          <h3 className="text-base font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("settings.notifications.title", "Bildirim tercihleri")}
          </h3>
        </div>
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
          <BiBell size={18} />
        </div>
      </header>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-husrev-sand/70 bg-husrev-cream/40 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-husrev-ink dark:text-husrev-cream">
            {t("settings.notifications.emailLabel", "Bildirimleri e-posta ile de al")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t(
              "settings.notifications.emailDescription",
              "Bildirim zamanı geldiğinde anlık push'a ek olarak {{email}} adresine bir e-posta gönderir. Sunucuda SMTP ayarlanmamışsa sessizce devre dışı kalır.",
              { email: user?.email ?? "" },
            )}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("settings.notifications.emailLabel", "Bildirimleri e-posta ile de al")}
          onClick={toggle}
          disabled={saving}
          className={`relative mt-1 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
            enabled
              ? "bg-husrev-ember"
              : "bg-husrev-sand dark:bg-white/[0.12]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-[1.375rem]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </section>
  );
}

function EditCards({
  initialFirstName,
  initialLastName,
}: {
  initialFirstName: string;
  initialLastName: string;
}) {
  const { t } = useTranslation();
  const { applyUser } = useAuth();
  const showAlert = alertStore((s) => s.show);

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const inputClass =
    "w-full rounded-xl border border-husrev-sand bg-white px-3 py-2 text-sm outline-none focus:border-husrev-amber dark:border-white/10 dark:bg-husrev-ink/40";

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await AuthService.updateProfile({ firstName, lastName });
      applyUser(updated);
      showAlert({
        title: t("profile.saved"),
        message: t("profile.profileUpdated"),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setSavingPassword(true);
    try {
      await AuthService.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      showAlert({
        title: t("profile.saved"),
        message: t("profile.passwordUpdated"),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Edit profile */}
      <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-6 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("profile.editProfile")}
          </h3>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
            <BiEdit size={18} />
          </div>
        </header>
        <form onSubmit={saveProfile} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-gray-400">
              {t("profile.firstName")}
            </label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-gray-400">
              {t("profile.lastName")}
            </label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={savingProfile}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <BiSave size={14} />
              {savingProfile ? t("profile.saving") : t("profile.save")}
            </button>
          </div>
        </form>
      </section>

      {/* Change password */}
      <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-6 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("profile.changePassword")}
          </h3>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-husrev-moss/15 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream">
            <BiLockAlt size={18} />
          </div>
        </header>
        <form onSubmit={savePassword} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-gray-400">
              {t("profile.currentPassword")}
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-gray-400">
              {t("profile.newPassword")}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={savingPassword || !currentPassword || !newPassword}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-600 disabled:opacity-50"
            >
              <BiSave size={14} />
              {savingPassword ? t("profile.saving") : t("profile.save")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FieldRow({
  icon,
  label,
  value,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="space-y-1">
      <dt className="flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
        <span className="text-husrev-ember/70 dark:text-husrev-amber/70">{icon}</span>
        {label}
      </dt>
      <dd
        className={`text-[15px] font-medium ${
          muted ? "text-gray-300 dark:text-gray-600" : "text-husrev-ink dark:text-husrev-cream"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
