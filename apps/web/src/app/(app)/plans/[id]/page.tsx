"use client";

import { useParams } from "next/navigation";
import PlanDetailPage from "@/views/plans/PlanDetailPage";

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return <PlanDetailPage id={Number.isFinite(id) ? id : 0} />;
}
