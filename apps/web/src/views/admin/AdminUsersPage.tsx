"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import { useAuth } from "@/providers/AuthProvider";
import {
  useAdminInvites,
  useAdminUsers,
} from "@/hooks/useAdmin";
import { AdminUser, InviteResponse } from "@/types/admin/admin";
import { BiPlus, BiSearch, BiShield, BiUser } from "react-icons/bi";
import { HiOutlineMail } from "react-icons/hi";
import { UserModal } from "./UserModal";
import { InviteModal } from "./InviteModal";

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [search, setSearch] = useState("");
  const [userModal, setUserModal] = useState<{
    open: boolean;
    initial: AdminUser | null;
  }>({ open: false, initial: null });
  const [inviteOpen, setInviteOpen] = useState(false);

  // Client-side admin gate. The API still enforces role server-side; this is
  // just to prevent rendering the admin UI shell for non-admins.
  useEffect(() => {
    if (loading) return;
    if (!user || user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const { data: users, isLoading: usersLoading } = useAdminUsers(search || undefined);
  const { data: invites } = useAdminInvites();

  if (loading || !user || user.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("admin.users.title", "Kullanıcılar")}
        kicker={t("admin.kicker", "Yönetim")}
        flourish={t("admin.users.flourish", "kullanıcılar")}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative inline-flex items-center">
          <BiSearch
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.users.searchPlaceholder", "İsim veya e-posta ara…")}
            className="husrev-input pl-9 w-72"
          />
        </label>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="husrev-btn"
        >
          <HiOutlineMail className="h-4 w-4" />
          {t("admin.users.invite", "Davet gönder")}
        </button>
      </div>

      {/* Pending invites */}
      {(invites?.filter((i) => !i.acceptedAt).length ?? 0) > 0 && (
        <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
              {t("admin.invites.pending", "Bekleyen davetler")}
            </h3>
          </header>
          <ul className="divide-y divide-husrev-sand/50 dark:divide-white/[0.04]">
            {invites
              ?.filter((i) => !i.acceptedAt)
              .map((inv) => (
                <PendingInviteRow key={inv.id} invite={inv} />
              ))}
          </ul>
        </section>
      )}

      {/* Users table */}
      <section className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white p-5 shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("admin.users.all", "Tüm kullanıcılar")}
            {users && (
              <span className="ml-2 husrev-pill">{users.total}</span>
            )}
          </h3>
        </header>
        {usersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-12 rounded-lg bg-husrev-sand/40 motion-safe:animate-pulse"
              />
            ))}
          </div>
        ) : (users?.items.length ?? 0) === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("admin.users.empty", "Kayıt bulunamadı")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                <tr className="border-b border-husrev-sand/50">
                  <th className="py-2 pr-3">{t("admin.users.col.user", "Kullanıcı")}</th>
                  <th className="py-2 pr-3">{t("admin.users.col.email", "E-posta")}</th>
                  <th className="py-2 pr-3">{t("admin.users.col.role", "Rol")}</th>
                  <th className="py-2 pr-3">{t("admin.users.col.status", "Durum")}</th>
                  <th className="py-2 pr-3">{t("admin.users.col.created", "Kayıt")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-husrev-sand/40 dark:divide-white/[0.04]">
                {users?.items.map((u) => {
                  const fullName =
                    [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                    u.email.split("@")[0];
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setUserModal({ open: true, initial: u })}
                      className="cursor-pointer hover:bg-husrev-cream/40 dark:hover:bg-white/[0.03]"
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
                            {u.role === "admin" ? (
                              <BiShield className="h-4 w-4" />
                            ) : (
                              <BiUser className="h-4 w-4" />
                            )}
                          </span>
                          <span className="font-medium text-husrev-ink dark:text-husrev-cream truncate">
                            {fullName}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-600 dark:text-gray-300 truncate max-w-[240px]">
                        {u.email}
                      </td>
                      <td className="py-2.5 pr-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge enabled={u.enabled} />
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString("tr-TR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {userModal.open && userModal.initial && (
        <UserModal
          initial={userModal.initial}
          isSelf={userModal.initial.id === user.id?.toString()}
          onClose={() => setUserModal({ open: false, initial: null })}
        />
      )}
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono uppercase tracking-[0.08em] ${
        isAdmin
          ? "bg-husrev-ember/15 text-husrev-ember"
          : "bg-husrev-sand/50 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
      }`}
    >
      {isAdmin ? <BiShield className="h-3 w-3" /> : null}
      {role}
    </span>
  );
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono uppercase tracking-[0.08em] ${
        enabled
          ? "bg-husrev-moss/15 text-husrev-moss dark:bg-husrev-moss/25 dark:text-husrev-cream"
          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-husrev-moss" : "bg-gray-400"}`} />
      {enabled ? "aktif" : "kapalı"}
    </span>
  );
}

function PendingInviteRow({ invite }: { invite: InviteResponse }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const expires = new Date(invite.expiresAt);
  const expired = expires.getTime() < Date.now();
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-husrev-amber/15 text-husrev-amber">
        <HiOutlineMail className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-husrev-ink dark:text-husrev-cream truncate">
          {invite.email}
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          {expired
            ? t("admin.invites.expired", "Süresi dolmuş")
            : t("admin.invites.expiresAt", "Son tarih: {{date}}", {
                date: expires.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }),
              })}
          {" · "}
          {invite.role}
        </div>
      </div>
    </li>
  );
}
