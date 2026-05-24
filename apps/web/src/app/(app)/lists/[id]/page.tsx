"use client";

import { useParams } from "next/navigation";
import ListDetailPage from "@/views/lists/ListDetailPage";

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return <ListDetailPage id={Number.isFinite(id) ? id : 0} />;
}
