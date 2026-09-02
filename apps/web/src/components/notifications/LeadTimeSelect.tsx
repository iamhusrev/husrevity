"use client";

import { useTranslation } from "react-i18next";

const LEAD_TIME_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

/** Shared picker for notification lead time; null disables notifications. */
export default function LeadTimeSelect({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <select
      value={value === null ? "off" : String(value)}
      onChange={(e) => onChange(e.target.value === "off" ? null : Number(e.target.value))}
      disabled={disabled}
      className="husrev-input"
    >
      <option value="off">{t("notifications.leadTime.off")}</option>
      {LEAD_TIME_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {t(`notifications.leadTime.option_${m}`)}
        </option>
      ))}
    </select>
  );
}
