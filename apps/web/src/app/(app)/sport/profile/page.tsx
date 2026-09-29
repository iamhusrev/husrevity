"use client";

import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import SportProfileCard from "@/views/sport/SportProfileCard";

export default function SportProfilePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("sport.tabs.profile", "Profil")}
        kicker={t("sport.kicker", "Antrenman takibi")}
      />
      <SportProfileCard />
    </div>
  );
}
