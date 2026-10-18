"use client";

import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import SportHome from "@/views/sport/SportHome";

// /sport is the "Today" home: active program, week strip and one-tap logging.
// The monthly log and stats live under /sport/history, profile and programs
// under their own sub-routes.
export default function SportPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("sport.title", "Spor")}
        kicker={t("sport.kicker", "Antrenman takibi")}
        flourish={t("sport.flourish", "formunda kal")}
      />
      <SportHome />
    </div>
  );
}
