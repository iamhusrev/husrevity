"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import SportProgramsList from "@/views/sport/SportProgramsList";
import SportProgramDetail from "@/views/sport/SportProgramDetail";

export default function SportProgramsPage() {
  const { t } = useTranslation();
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        pageTitle={t("sport.tabs.programs", "Programlar")}
        kicker={t("sport.kicker", "Antrenman takibi")}
      />
      {selectedProgramId ? (
        <SportProgramDetail
          programId={selectedProgramId}
          onBack={() => setSelectedProgramId(null)}
        />
      ) : (
        <SportProgramsList onOpenDetail={setSelectedProgramId} />
      )}
    </div>
  );
}
