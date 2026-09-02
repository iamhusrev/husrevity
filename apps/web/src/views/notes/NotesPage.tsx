"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui";
import Button from "@/components/button/Button";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";
import { Modal } from "@/components/modal";
import DetailModal from "@/components/modal/DetailModal";
import { Dropdown } from "@/components/dropdown/Dropdown";
import { DropdownItem } from "@/components/dropdown/DropdownItem";
import NoteEditorPage from "@/views/notes/NoteEditorPage";
import {
  useCreateNote,
  useCreateTag,
  useDeleteNote,
  useDeleteTag,
  useNotes,
  useNoteTags,
  useReorderNotes,
  useUpdateNote,
} from "@/hooks/useNotes";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { exportAsPdf, exportAsTxt } from "@/utils/export";
import { slugify } from "@/utils/utils";
import { formatDateTime } from "@/utils/i18n-date";
import {
  BiPin,
  BiSolidPin,
  BiTrash,
  BiMenu,
  BiPurchaseTag,
  BiArchive,
  BiDownload,
} from "react-icons/bi";
import { NoteRequest } from "@/types/note/note";

/** Build a complete NoteRequest from a note — update() nulls omitted fields. */
function toNoteRequest(note: NoteResponse, patch: Partial<NoteRequest>): NoteRequest {
  return {
    title: note.title,
    bodyMarkdown: note.bodyMarkdown,
    pinned: note.pinned,
    archived: note.archived,
    tagIds: note.tags.map((tg) => tg.id),
    colorHex: note.colorHex,
    ...patch,
  };
}
import { NoteFilters, NoteResponse } from "@/types/note/note";

const DRAG_TYPE = "NOTE_CARD";

interface DragItem {
  index: number;
  id: number;
}

/** Builds the "Tags / Created / Updated" footer shared by both export formats. */
function noteExportMetaLines(note: NoteResponse, t: ReturnType<typeof useTranslation>["t"]): string {
  const tags = note.tags.length > 0 ? note.tags.map((tag) => tag.name).join(", ") : "—";
  const created = note.createdAt ? formatDateTime(note.createdAt) : "—";
  const updated = note.updatedAt ? formatDateTime(note.updatedAt) : "—";
  return [
    `${t("notes.export.tagsLabel")}: ${tags}`,
    `${t("notes.export.createdLabel")}: ${created}`,
    `${t("notes.export.updatedLabel")}: ${updated}`,
  ].join("\n");
}

/** Per-note export trigger — icon button + Dropdown with .txt/.pdf choices. */
function NoteExportMenu({ note }: { note: NoteResponse }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const filename = (ext: "txt" | "pdf") => `notes-${slugify(note.title)}.${ext}`;

  const handleExportTxt = () => {
    const content = `${note.title}\n\n${note.bodyMarkdown ?? ""}\n\n---\n${noteExportMetaLines(note, t)}\n`;
    exportAsTxt(filename("txt"), content);
    setOpen(false);
  };

  const handleExportPdf = () => {
    const text = `${noteExportMetaLines(note, t)}\n\n${note.bodyMarkdown ?? ""}`;
    exportAsPdf(filename("pdf"), { title: note.title, text });
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="dropdown-toggle rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
        aria-label={t("notes.export.aria")}
      >
        <BiDownload size={16} />
      </button>
      <Dropdown isOpen={open} onClose={() => setOpen(false)} className="w-48 p-1.5">
        <DropdownItem
          onClick={handleExportTxt}
          baseClassName="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {t("notes.export.txt")}
        </DropdownItem>
        <DropdownItem
          onClick={handleExportPdf}
          baseClassName="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {t("notes.export.pdf")}
        </DropdownItem>
      </Dropdown>
    </div>
  );
}

function DraggableNoteCard({
  note,
  index,
  moveNote,
  onDrop,
  onDelete,
  onOpen,
  onTogglePin,
  onToggleArchive,
}: {
  note: NoteResponse;
  index: number;
  moveNote: (dragIdx: number, hoverIdx: number) => void;
  onDrop: () => void;
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
  onTogglePin: (note: NoteResponse) => void;
  onToggleArchive: (note: NoteResponse) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { index, id: note.id },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop();
    },
  });

  const [, dropRef] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(item) {
      if (item.index === index) return;
      moveNote(item.index, index);
      item.index = index;
    },
    drop: () => ({}),
  });

  dragRef(dropRef(ref));

  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0.4 : 1,
        backgroundColor: note.colorHex ?? undefined,
      }}
      className="group relative rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 transition hover:shadow-md dark:bg-husrev-shadow dark:ring-white/[0.06]"
    >
      <span className="absolute left-3 top-5 cursor-grab text-gray-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing">
        <BiMenu size={14} />
      </span>
      <div className="flex justify-end gap-1 mb-2">
        <NoteExportMenu note={note} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleArchive(note);
          }}
          className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
          aria-label={t("notes.archiveAria")}
        >
          <BiArchive size={16} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(note);
          }}
          className="rounded-full p-2 text-gray-400 transition hover:bg-husrev-amber/10 hover:text-husrev-amber"
          aria-label={t("notes.pinAria")}
        >
          <BiPin size={16} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
          aria-label={t("notes.deleteAria")}
        >
          <BiTrash size={16} />
        </button>
      </div>
      <button type="button" onClick={() => onOpen(note.id)} className="block w-full cursor-pointer pl-4 text-left">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{note.title}</h3>
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-gray-500 dark:text-gray-400">
          {note.bodyMarkdown ?? ""}
        </p>
        {note.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {note.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

function PinnedCard({
  note,
  onDelete,
  onOpen,
  onTogglePin,
  onToggleArchive,
}: {
  note: NoteResponse;
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
  onTogglePin: (note: NoteResponse) => void;
  onToggleArchive: (note: NoteResponse) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{ backgroundColor: note.colorHex ?? undefined }}
      className="group relative rounded-2xl ring-2 ring-husrev-amber/60 bg-husrev-cream/40 shadow-card-warm p-5 transition hover:shadow-md dark:bg-husrev-shadow dark:ring-husrev-amber/40"
    >
      <div className="flex justify-end gap-1 mb-2">
        <NoteExportMenu note={note} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleArchive(note);
          }}
          className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
          aria-label={t("notes.archiveAria")}
        >
          <BiArchive size={16} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(note);
          }}
          className="rounded-full p-2 text-husrev-amber transition hover:bg-husrev-amber/10"
          aria-label={t("notes.unpinAria")}
        >
          <BiSolidPin size={16} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
          aria-label={t("notes.deleteAria")}
        >
          <BiTrash size={16} />
        </button>
      </div>
      <button type="button" onClick={() => onOpen(note.id)} className="block w-full cursor-pointer text-left">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-husrev-ink dark:text-white/90">
            {note.title}
          </h3>
          <BiSolidPin className="shrink-0 text-husrev-amber" size={16} />
        </div>
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-gray-500 dark:text-gray-400">
          {note.bodyMarkdown ?? ""}
        </p>
        {note.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {note.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-husrev-amber/10 px-2 py-0.5 text-xs text-husrev-ember dark:bg-husrev-amber/20 dark:text-husrev-amber"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

function NotesGrid({
  notes,
  onDelete,
  onOpen,
  onTogglePin,
  onToggleArchive,
}: {
  notes: NoteResponse[];
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
  onTogglePin: (note: NoteResponse) => void;
  onToggleArchive: (note: NoteResponse) => void;
}) {
  const reorderNotes = useReorderNotes();

  const pinned = notes.filter((n) => n.pinned);
  const serverUnpinned = [...notes.filter((n) => !n.pinned)].sort(
    (a, b) => a.position - b.position,
  );

  const [ordered, setOrdered] = useState<NoteResponse[]>(serverUnpinned);
  const orderedRef = useRef<NoteResponse[]>(serverUnpinned);
  const dragging = useRef(false);

  // When server data changes (note added/deleted), sync local order
  useEffect(() => {
    if (!dragging.current) {
      setOrdered(serverUnpinned);
      orderedRef.current = serverUnpinned;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  const moveNote = useCallback((dragIdx: number, hoverIdx: number) => {
    dragging.current = true;
    setOrdered((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIdx, 1);
      next.splice(hoverIdx, 0, item);
      orderedRef.current = next;
      return next;
    });
  }, []);

  const onDrop = useCallback(() => {
    dragging.current = false;
    const items = orderedRef.current.map((n, i) => ({ id: n.id, position: i }));
    reorderNotes.mutate(items);
  }, [reorderNotes]);

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {pinned.map((note) => (
          <PinnedCard
            key={note.id}
            note={note}
            onDelete={onDelete}
            onOpen={onOpen}
            onTogglePin={onTogglePin}
            onToggleArchive={onToggleArchive}
          />
        ))}
        {ordered.map((note, index) => (
          <DraggableNoteCard
            key={note.id}
            note={note}
            index={index}
            moveNote={moveNote}
            onDrop={onDrop}
            onDelete={onDelete}
            onOpen={onOpen}
            onTogglePin={onTogglePin}
            onToggleArchive={onToggleArchive}
          />
        ))}
      </div>
    </DndProvider>
  );
}

function ManageTagsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const { data: tags = [] } = useNoteTags();
  const createTag = useCreateTag();
  const deleteTag = useDeleteTag();
  const [name, setName] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createTag.mutateAsync({ name: name.trim() });
      setName("");
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteTag.mutateAsync(id);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="mx-4 my-6 w-full max-w-md p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
        {t("notes.manageTags")}
      </h3>
      <form onSubmit={add} className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("notes.tagName")}
          className="h-10 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
        />
        <Button size="sm" disabled={!name.trim() || createTag.isPending}>
          + {t("notes.addTag")}
        </Button>
      </form>
      {tags.length === 0 ? (
        <p className="text-sm text-gray-400">{t("notes.noTags")}</p>
      ) : (
        <ul className="space-y-1">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span className="text-gray-700 dark:text-gray-300">{tag.name}</span>
              <button
                onClick={() => remove(tag.id)}
                className="rounded p-1 text-gray-300 transition hover:text-red-500"
                aria-label={t("common.delete")}
              >
                <BiTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function NotesPage() {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const router = useRouter();

  const [filters, setFilters] = useState<NoteFilters>({ archived: false });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [showTags, setShowTags] = useState(false);

  const [quickTitle, setQuickTitle] = useState("");

  // Holds the editor's flush() so closing the modal saves the in-progress note.
  const editorFlushRef = useRef<(() => Promise<void>) | null>(null);

  const handleEditorClose = useCallback(async () => {
    await editorFlushRef.current?.();
    setEditingId(null);
  }, []);

  const { data: notes = [], isLoading } = useNotes(filters);
  const { data: tags = [] } = useNoteTags();
  const deleteNote = useDeleteNote();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    try {
      await createNote.mutateAsync({ title });
      setQuickTitle("");
    } catch (err) {
      const { title: et, message } = parseAxiosError(err);
      showAlert({ title: et, message, type: "error", position: "top-center" });
    }
  };

  const handleTogglePin = async (note: NoteResponse) => {
    try {
      await updateNote.mutateAsync({
        id: note.id,
        body: toNoteRequest(note, { pinned: !note.pinned }),
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleToggleArchive = async (note: NoteResponse) => {
    try {
      await updateNote.mutateAsync({
        id: note.id,
        body: toNoteRequest(note, { archived: !note.archived }),
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const onDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteNote.mutateAsync(deletingId);
      showAlert({
        title: t("notes.deletedTitle"),
        message: t("notes.deletedMessage"),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        pageTitle={t("notes.title")}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowTags(true)}>
              <BiPurchaseTag size={14} /> {t("notes.manageTags")}
            </Button>
            <Button size="sm" onClick={() => setEditingId("new")}>
              + {t("notes.newNote")}
            </Button>
          </>
        }
      />

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder={t("notes.searchPlaceholder")}
            value={filters.q ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
          />
          <select
            value={filters.tagId ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                tagId: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">{t("notes.allTags")}</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={filters.archived ?? false}
              onChange={(e) => setFilters((f) => ({ ...f, archived: e.target.checked }))}
            />
            {t("notes.archived")}
          </label>
        </div>

        <form onSubmit={handleQuickAdd}>
          <input
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder={t("notes.quickAddPlaceholder")}
            className="h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm outline-none transition focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
          />
        </form>

        {isLoading ? (
          <p className="text-gray-500">{t("common.loading")}</p>
        ) : notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-husrev-sand p-10 text-center text-gray-500 dark:border-white/10">
            {t("notes.empty.before")}{" "}
            <span className="font-instrument-serif italic text-husrev-ember dark:text-husrev-amber">
              {t("notes.empty.flourish")}
            </span>
            .
          </div>
        ) : (
          <NotesGrid
            notes={notes}
            onDelete={setDeletingId}
            onOpen={(id) => setEditingId(Number(id))}
            onTogglePin={handleTogglePin}
            onToggleArchive={handleToggleArchive}
          />
        )}

        <DeleteConfirmModal
          isOpen={deletingId !== null}
          onClose={() => setDeletingId(null)}
          onConfirm={onDelete}
          isPending={deleteNote.isPending}
        />

        {showTags && <ManageTagsModal onClose={() => setShowTags(false)} />}

        <DetailModal
          isOpen={editingId !== null}
          onClose={handleEditorClose}
          onExpand={
            editingId !== null
              ? () =>
                  router.push(editingId === "new" ? "/notes/new" : `/notes/${editingId}`)
              : undefined
          }
        >
          {editingId === "new" ? (
            <NoteEditorPage
              embedded
              flushRef={editorFlushRef}
              onSaved={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          ) : editingId !== null ? (
            <NoteEditorPage
              id={editingId}
              embedded
              flushRef={editorFlushRef}
              onSaved={() => setEditingId(null)}
              onCancel={() => setEditingId(null)}
            />
          ) : null}
        </DetailModal>
      </div>
  );
}
