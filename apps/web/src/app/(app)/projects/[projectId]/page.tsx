"use client";

import { useParams } from "next/navigation";
import ProjectDetailPage from "@/views/projects/ProjectDetailPage";

export default function Page() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  return <ProjectDetailPage projectId={projectId} />;
}
