"use client";

import { useParams } from "next/navigation";
import ProjectDetailPage from "@/views/projects/ProjectDetailPage";

export default function Page() {
  const params = useParams<{ code: string }>();
  return <ProjectDetailPage code={params.code} />;
}
