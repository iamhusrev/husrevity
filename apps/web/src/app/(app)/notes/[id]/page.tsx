"use client";

import { useParams } from "next/navigation";
import NoteEditorPage from "@/views/notes/NoteEditorPage";

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  return <NoteEditorPage id={Number.isFinite(id) ? id : undefined} />;
}
