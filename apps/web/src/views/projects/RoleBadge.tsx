"use client";

import { useTranslation } from "react-i18next";
import { ProjectRole } from "@/types/project/project";

const ROLE_COLOR: Record<ProjectRole, string> = {
  OWNER: "bg-husrev-ember/15 text-husrev-ember dark:bg-husrev-ember/25 dark:text-husrev-amber",
  EDITOR: "bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber",
  VIEWER: "bg-husrev-sand/60 text-husrev-shadow dark:bg-white/5 dark:text-husrev-cream",
};

const ROLE_FALLBACK: Record<ProjectRole, string> = {
  OWNER: "Sahip",
  EDITOR: "Düzenleyici",
  VIEWER: "Görüntüleyici",
};

export default function RoleBadge({
  role,
  className,
}: {
  role: ProjectRole;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-mono uppercase tracking-[0.12em] ${ROLE_COLOR[role]} ${className ?? ""}`}
    >
      {t(`projects.roles.${role}`, ROLE_FALLBACK[role])}
    </span>
  );
}
