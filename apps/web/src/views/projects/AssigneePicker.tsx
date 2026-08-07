"use client";

import { useTranslation } from "react-i18next";
import { useProjectMembers } from "@/hooks/useProjects";

export default function AssigneePicker({
  projectId,
  value,
  onChange,
  disabled,
}: {
  projectId: number;
  value: number | null;
  onChange: (assigneeId: number | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { data: members = [], isLoading } = useProjectMembers(projectId);

  if (isLoading) {
    return (
      <select disabled className="husrev-input">
        <option>{t("common.loading", "Yükleniyor…")}</option>
      </select>
    );
  }

  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="husrev-input"
    >
      <option value="">{t("kanban.modal.unassigned", "Atanmamış")}</option>
      {members.map((m) => (
        <option key={m.userId} value={m.userId}>
          {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.email}
        </option>
      ))}
    </select>
  );
}
