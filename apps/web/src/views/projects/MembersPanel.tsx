"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  BiChevronDown,
  BiChevronUp,
  BiGroup,
  BiPlus,
  BiTrash,
  BiLogOut,
  BiX,
} from "react-icons/bi";
import {
  useProjectMembers,
  useProjectInvites,
  useUpdateProjectMemberRole,
  useRemoveProjectMember,
  useLeaveProject,
  useRevokeProjectInvite,
} from "@/hooks/useProjects";
import { useAuth } from "@/providers/AuthProvider";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatDate } from "@/utils/i18n-date";
import { ProjectMemberResponse, ProjectRole } from "@/types/project/project";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";
import { Sk } from "@/components/skeletons";
import RoleBadge from "./RoleBadge";
import MemberAvatar from "./MemberAvatar";
import AddMemberModal from "./AddMemberModal";

export default function MembersPanel({
  projectId,
  isOwner,
}: {
  projectId: number;
  isOwner: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const showAlert = alertStore((s) => s.show);

  const [expanded, setExpanded] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ProjectMemberResponse | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const { data: members = [], isLoading } = useProjectMembers(projectId);
  const { data: invites = [], isLoading: invitesLoading } = useProjectInvites(
    isOwner ? projectId : 0,
  );

  const updateRole = useUpdateProjectMemberRole();
  const removeMember = useRemoveProjectMember();
  const leaveProject = useLeaveProject();
  const revokeInvite = useRevokeProjectInvite();

  const handleRoleChange = async (memberId: number, role: Exclude<ProjectRole, "OWNER">) => {
    try {
      await updateRole.mutateAsync({ id: projectId, memberId, body: { role } });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    try {
      await removeMember.mutateAsync({ id: projectId, memberId: removeTarget.id });
      setRemoveTarget(null);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleLeave = async () => {
    try {
      await leaveProject.mutateAsync(projectId);
      setShowLeaveConfirm(false);
      router.push("/projects");
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleRevoke = async (inviteId: number) => {
    try {
      await revokeInvite.mutateAsync({ id: projectId, inviteId });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
          <BiGroup size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-husrev-ink dark:text-husrev-cream">
            {t("projects.members.title", "Üyeler")}
          </span>
          <span className="block text-[12px] text-gray-500 dark:text-gray-400">
            {t("projects.members.count", "{{count}} kişi", { count: members.length })}
          </span>
        </span>
        {!expanded && members.length > 1 && (
          <div className="hidden sm:flex -space-x-2 mr-1">
            {members.slice(0, 4).map((m) => (
              <MemberAvatar
                key={m.id}
                firstName={m.firstName}
                lastName={m.lastName}
                email={m.email}
                size="sm"
              />
            ))}
          </div>
        )}
        {expanded ? (
          <BiChevronUp size={18} className="shrink-0 text-gray-400" />
        ) : (
          <BiChevronDown size={18} className="shrink-0 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-husrev-sand/70 px-5 py-4 dark:border-white/[0.06]">
          <div className="flex items-center justify-between">
            <span className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("projects.members.listTitle", "Üye listesi")}
            </span>
            {isOwner && (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="husrev-btn-ghost"
              >
                <BiPlus size={15} /> {t("projects.members.add", "Üye ekle")}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Sk key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("projects.members.empty", "Henüz üye yok.")}
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => {
                const isMe = m.userId === user?.id;
                const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email;
                const canManage = isOwner && m.role !== "OWNER";
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-xl ring-1 ring-husrev-sand/80 bg-white/60 px-3 py-2 dark:bg-white/[0.02] dark:ring-white/[0.06]"
                  >
                    <MemberAvatar firstName={m.firstName} lastName={m.lastName} email={m.email} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                          {name}
                        </span>
                        {isMe && (
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            ({t("projects.members.you", "sen")})
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[12px] text-gray-500 dark:text-gray-400">
                        {m.email}
                      </div>
                    </div>

                    {canManage ? (
                      <select
                        value={m.role}
                        onChange={(e) =>
                          handleRoleChange(m.id, e.target.value as Exclude<ProjectRole, "OWNER">)
                        }
                        disabled={updateRole.isPending}
                        className="husrev-input w-auto py-1 text-xs"
                      >
                        <option value="EDITOR">{t("projects.roles.EDITOR", "Düzenleyici")}</option>
                        <option value="VIEWER">{t("projects.roles.VIEWER", "Görüntüleyici")}</option>
                      </select>
                    ) : (
                      <RoleBadge role={m.role} />
                    )}

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(m)}
                        className="rounded-full p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                        aria-label={t("projects.members.remove", "Üyeyi çıkar")}
                      >
                        <BiTrash size={14} />
                      </button>
                    )}

                    {isMe && m.role !== "OWNER" && (
                      <button
                        type="button"
                        onClick={() => setShowLeaveConfirm(true)}
                        className="rounded-full p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                        aria-label={t("projects.members.leave", "Projeden ayrıl")}
                      >
                        <BiLogOut size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {isOwner && (
            <div className="space-y-2">
              <span className="husrev-kicker text-gray-500 dark:text-gray-400">
                {t("projects.members.pendingTitle", "Bekleyen davetler")}
              </span>
              {invitesLoading ? (
                <Sk className="h-10 w-full rounded-xl" />
              ) : invites.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("projects.members.noPending", "Bekleyen davet yok.")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {invites.map((inv) => (
                    <li
                      key={inv.id}
                      className="flex items-center gap-3 rounded-xl ring-1 ring-husrev-sand/80 bg-husrev-cream/40 px-3 py-2 dark:bg-white/[0.02] dark:ring-white/[0.06]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-husrev-ink dark:text-husrev-cream">
                          {inv.email}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          {t("projects.members.expiresAt", "Son geçerlilik: {{date}}", {
                            date: formatDate(inv.expiresAt),
                          })}
                        </div>
                      </div>
                      <RoleBadge role={inv.role} />
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={revokeInvite.isPending}
                        className="rounded-full p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                        aria-label={t("projects.members.revoke", "Daveti iptal et")}
                      >
                        <BiX size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {showAddModal && <AddMemberModal projectId={projectId} onClose={() => setShowAddModal(false)} />}

      <DeleteConfirmModal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemoveConfirm}
        isPending={removeMember.isPending}
        title={t("projects.members.removeTitle", "Üyeyi çıkar")}
        message={t(
          "projects.members.removeMessage",
          "{{name}} bu projeden çıkarılacak ve erişimini kaybedecek.",
          {
            name: removeTarget
              ? [removeTarget.firstName, removeTarget.lastName].filter(Boolean).join(" ") ||
                removeTarget.email
              : "",
          },
        )}
        confirmLabel={t("projects.members.remove", "Üyeyi çıkar")}
      />

      <DeleteConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeave}
        isPending={leaveProject.isPending}
        title={t("projects.members.leaveTitle", "Projeden ayrıl")}
        message={t(
          "projects.members.leaveMessage",
          "Bu projeden ayrılacaksın ve erişimini kaybedeceksin. Emin misin?",
        )}
        confirmLabel={t("projects.members.leave", "Projeden ayrıl")}
      />
    </div>
  );
}
