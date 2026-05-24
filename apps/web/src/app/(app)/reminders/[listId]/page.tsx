"use client";

import { useParams } from "next/navigation";
import RemindersPage from "@/views/reminders/RemindersPage";

export default function Page() {
  const params = useParams<{ listId: string }>();
  const id = Number(params.listId);
  return <RemindersPage initialListId={Number.isFinite(id) ? id : undefined} />;
}
