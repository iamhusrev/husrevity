"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import DeleteConfirmModal from "@/components/modal/DeleteConfirmModal";
import { Dropdown } from "@/components/dropdown/Dropdown";
import { DropdownItem } from "@/components/dropdown/DropdownItem";
import {
  useCreateListSection,
  useCreateTodoListItem,
  useDeleteListSection,
  useDeleteTodoListItem,
  useListSections,
  useReorderTodoListItems,
  useRestoreTodoListItem,
  useToggleTodoListItem,
  useTodoList,
  useTodoListItems,
  useUpdateListSection,
  useUpdateTodoList,
} from "@/hooks/useLists";
import { ListSectionResponse, TodoListItemResponse } from "@/types/list/list";
import { alertStore, showUndoToast } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatDateTime } from "@/utils/i18n-date";
import { exportAsPdf, exportAsTxt } from "@/utils/export";
import { slugify } from "@/utils/utils";
import {
  BiPlus,
  BiTrash,
  BiMenu,
  BiArrowBack,
  BiEditAlt,
  BiCheck,
  BiX,
  BiDownload,
} from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";

const DRAG_TYPE = "TODO_LIST_ITEM";
const UNGROUPED = "none";

const sectionKeyOf = (item: TodoListItemResponse): string =>
  item.sectionId == null ? UNGROUPED : String(item.sectionId);

interface DragItem {
  index: number;
  id: number;
  sectionKey: string;
}

function ItemRow({
  item,
  index,
  listId,
  moveItem,
  onDrop,
}: {
  item: TodoListItemResponse;
  index: number;
  listId: number;
  moveItem: (drag: number, hover: number) => void;
  onDrop: () => void;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const toggle = useToggleTodoListItem();
  const remove = useDeleteTodoListItem();
  const restore = useRestoreTodoListItem();
  const ref = useRef<HTMLDivElement>(null);
  const sectionKey = sectionKeyOf(item);

  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { index, id: item.id, sectionKey },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop();
    },
  });

  const [, dropRef] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(d) {
      // Reorder only within the same section.
      if (d.sectionKey !== sectionKey || d.index === index) return;
      moveItem(d.index, index);
      d.index = index;
    },
    drop: () => ({}),
  });

  dragRef(dropRef(ref));

  const handleToggle = async () => {
    try {
      await toggle.mutateAsync({ id: item.id, listId });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleDelete = async () => {
    try {
      await remove.mutateAsync({ id: item.id, listId });
      showUndoToast({
        message: t("lists.undo.itemDeleted", { text: item.text }),
        onUndo: () => restore.mutateAsync({ id: item.id, listId }),
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0.4 : 1,
        transform: isDragging ? "scale(0.99)" : undefined,
      }}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 hover:bg-husrev-cream/60 dark:hover:bg-white/[0.04]"
    >
      <span className="cursor-grab text-gray-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing dark:text-gray-600">
        <BiMenu size={14} className="rotate-90" />
      </span>
      <button
        type="button"
        onClick={handleToggle}
        className="shrink-0 text-gray-400 transition hover:text-brand-500"
        aria-label={item.done ? t("lists.toggle.incomplete") : t("lists.toggle.complete")}
      >
        {item.done ? (
          <BsCheckCircleFill size={18} className="text-brand-500" />
        ) : (
          <BsCircle size={18} />
        )}
      </button>
      <div className="flex flex-1 flex-col min-w-0">
        <span
          className={`truncate text-sm ${
            item.done
              ? "line-through text-gray-400 dark:text-gray-500"
              : "text-gray-800 dark:text-white/90"
          }`}
        >
          {item.text}
        </span>
        {item.dueAt && (
          <span className="text-xs text-gray-400">
            {formatDateTime(item.dueAt, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleDelete}
        className="rounded-full p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
        aria-label={t("lists.deleteAria")}
      >
        <BiTrash size={14} />
      </button>
    </div>
  );
}

function SectionGroup({
  listId,
  section,
  items,
  indexOf,
  moveItem,
  onDrop,
  onAdd,
  adding,
}: {
  listId: number;
  section: ListSectionResponse | null;
  items: TodoListItemResponse[];
  indexOf: (id: number) => number;
  moveItem: (drag: number, hover: number) => void;
  onDrop: () => void;
  onAdd: (text: string, sectionId: number | null) => Promise<void>;
  adding: boolean;
}) {
  const { t } = useTranslation();
  const showAlert = alertStore((s) => s.show);
  const renameSection = useUpdateListSection();
  const deleteSection = useDeleteListSection();

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(section?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sectionId = section ? section.id : null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    await onAdd(trimmed, sectionId);
    setDraft("");
  };

  const handleRename = async () => {
    const trimmed = editName.trim();
    if (!section || !trimmed) {
      setEditing(false);
      return;
    }
    try {
      await renameSection.mutateAsync({ id: section.id, listId, body: { name: trimmed } });
      setEditing(false);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleDelete = async () => {
    if (!section) return;
    try {
      await deleteSection.mutateAsync({ id: section.id, listId });
      setConfirmDelete(false);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="space-y-1">
      {/* Header — only real sections get one (the ungrouped bucket is headerless). */}
      {section &&
        (editing ? (
          <div className="flex items-center gap-2 px-3 py-1.5">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setEditing(false);
              }}
              className="husrev-input flex-1 py-1.5 text-sm font-semibold"
            />
            <button
              type="button"
              onClick={handleRename}
              className="rounded-full p-1.5 text-husrev-moss hover:bg-husrev-moss/10"
              aria-label={t("lists.sections.saveAria")}
            >
              <BiCheck size={16} />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
              aria-label={t("lists.sections.cancelAria")}
            >
              <BiX size={16} />
            </button>
          </div>
        ) : (
          <div className="group/sec flex items-center gap-2 px-3 pt-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-husrev-ink/70 dark:text-husrev-cream/70">
              {section.name}
            </h3>
            <span className="text-xs text-gray-400">{items.length}</span>
            <div className="ml-auto flex items-center opacity-0 transition group-hover/sec:opacity-100">
              <button
                type="button"
                onClick={() => {
                  setEditName(section.name);
                  setEditing(true);
                }}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-husrev-ink dark:hover:bg-white/[0.06]"
                aria-label={t("lists.sections.renameAria")}
              >
                <BiEditAlt size={14} />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                aria-label={t("lists.sections.deleteAria")}
              >
                <BiTrash size={14} />
              </button>
            </div>
          </div>
        ))}

      {/* Ungrouped bucket gets a subtle label so it's not anonymous. */}
      {!section && items.length > 0 && (
        <div className="px-3 pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            {t("lists.sections.ungrouped")}
          </h3>
        </div>
      )}

      <div className="space-y-0.5">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            index={indexOf(item.id)}
            listId={listId}
            moveItem={moveItem}
            onDrop={onDrop}
          />
        ))}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 px-3 pb-1 pt-0.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            section ? t("lists.sections.addItemPlaceholder") : t("lists.newItemPlaceholder")
          }
          className="husrev-input flex-1 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim() || adding}
          className="husrev-btn shrink-0 px-3 py-1.5"
          aria-label={t("lists.addAria")}
        >
          <BiPlus size={16} />
        </button>
      </form>

      <DeleteConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        isPending={deleteSection.isPending}
        title={t("lists.sections.deleteTitle")}
        message={t("lists.sections.deleteMessage")}
      />
    </div>
  );
}

export default function ListDetailPage({
  id,
  embedded,
}: {
  id: number;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const { data: list } = useTodoList(id);
  const { data: items = [], isLoading } = useTodoListItems(id);
  const { data: sections = [] } = useListSections(id);
  const create = useCreateTodoListItem();
  const reorder = useReorderTodoListItems();
  const createSection = useCreateListSection();
  const renameList = useUpdateTodoList();

  const [sectionDraft, setSectionDraft] = useState("");
  const [editingListName, setEditingListName] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.position - b.position),
    [items],
  );
  const [ordered, setOrdered] = useState<TodoListItemResponse[]>(sorted);
  const orderedRef = useRef<TodoListItemResponse[]>(sorted);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) {
      setOrdered(sorted);
      orderedRef.current = sorted;
    }
  }, [sorted]);

  const indexOf = useCallback(
    (itemId: number) => ordered.findIndex((it) => it.id === itemId),
    [ordered],
  );

  const moveItem = useCallback((drag: number, hover: number) => {
    dragging.current = true;
    setOrdered((prev) => {
      const next = [...prev];
      const [it] = next.splice(drag, 1);
      next.splice(hover, 0, it);
      orderedRef.current = next;
      return next;
    });
  }, []);

  const onDrop = useCallback(() => {
    dragging.current = false;
    const payload = orderedRef.current.map((it, i) => ({ id: it.id, position: i }));
    reorder.mutate({ listId: id, items: payload });
  }, [reorder, id]);

  const handleAddItem = useCallback(
    async (text: string, sectionId: number | null) => {
      try {
        await create.mutateAsync({ listId: id, body: { text, sectionId } });
      } catch (err) {
        const { title, message } = parseAxiosError(err);
        showAlert({ title, message, type: "error", position: "top-center" });
      }
    },
    [create, id, showAlert],
  );

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sectionDraft.trim();
    if (!trimmed) return;
    try {
      await createSection.mutateAsync({ listId: id, body: { name: trimmed } });
      setSectionDraft("");
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleRenameListStart = () => {
    if (!list) return;
    setEditingListName(list.name);
  };

  const handleRenameListSave = async () => {
    const trimmed = (editingListName ?? "").trim();
    if (!trimmed) {
      setEditingListName(null);
      return;
    }
    try {
      await renameList.mutateAsync({ id, body: { name: trimmed } });
      setEditingListName(null);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleRenameListCancel = () => {
    setEditingListName(null);
  };

  const sortedSections = useMemo(
    () => [...sections].sort((a, b) => a.position - b.position),
    [sections],
  );

  const itemsBySection = useMemo(() => {
    const map = new Map<string, TodoListItemResponse[]>();
    for (const it of ordered) {
      const key = sectionKeyOf(it);
      const bucket = map.get(key);
      if (bucket) bucket.push(it);
      else map.set(key, [it]);
    }
    return map;
  }, [ordered]);

  if (id <= 0) {
    return <p className="p-6 text-gray-500">{t("lists.invalid")}</p>;
  }

  const ungrouped = itemsBySection.get(UNGROUPED) ?? [];

  // Sections in display order, mirroring how the page itself renders them
  // (ungrouped bucket first, then real sections by position).
  const orderedSectionGroups: { name: string; items: TodoListItemResponse[] }[] = [
    { name: t("lists.sections.ungrouped"), items: ungrouped },
    ...sortedSections.map((section) => ({
      name: section.name,
      items: itemsBySection.get(String(section.id)) ?? [],
    })),
  ];

  const exportFilename = (ext: "txt" | "pdf") =>
    `lists-${slugify(list?.name ?? t("lists.title"))}.${ext}`;

  const handleExportListTxt = () => {
    const lines: string[] = [list?.name ?? t("lists.title"), ""];
    for (const group of orderedSectionGroups) {
      if (group.items.length === 0) continue;
      lines.push(group.name);
      for (const item of group.items) {
        lines.push(`${item.done ? "[x]" : "[ ]"} ${item.text}`);
      }
      lines.push("");
    }
    exportAsTxt(exportFilename("txt"), lines.join("\n").trimEnd() + "\n");
    setExportMenuOpen(false);
  };

  const handleExportListPdf = () => {
    const rows: (string | number)[][] = [];
    for (const group of orderedSectionGroups) {
      for (const item of group.items) {
        rows.push([
          group.name,
          item.text,
          item.done ? t("lists.export.doneYes") : t("lists.export.doneNo"),
          item.dueAt ? formatDateTime(item.dueAt) : "—",
        ]);
      }
    }
    exportAsPdf(exportFilename("pdf"), {
      title: list?.name ?? t("lists.title"),
      columns: [
        t("lists.export.sectionColumn"),
        t("lists.export.itemColumn"),
        t("lists.export.doneColumn"),
        t("lists.export.dueColumn"),
      ],
      rows,
    });
    setExportMenuOpen(false);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-6">
        {!embedded && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/lists")}
              className="shrink-0 rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label={t("common.back")}
            >
              <BiArrowBack size={18} />
            </button>
            {editingListName !== null ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  autoFocus
                  value={editingListName}
                  onChange={(e) => setEditingListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameListSave();
                    if (e.key === "Escape") handleRenameListCancel();
                  }}
                  className="husrev-input flex-1 py-2 text-lg font-semibold"
                />
                <button
                  type="button"
                  onClick={handleRenameListSave}
                  disabled={renameList.isPending}
                  className="shrink-0 rounded-full p-2 text-husrev-moss hover:bg-husrev-moss/10"
                  aria-label={t("lists.sections.saveAria")}
                >
                  <BiCheck size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleRenameListCancel}
                  className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                  aria-label={t("lists.sections.cancelAria")}
                >
                  <BiX size={18} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1">
                  <PageBreadcrumb pageTitle={list?.name ?? t("lists.title")} />
                </div>
                {list && (
                  <button
                    type="button"
                    onClick={handleRenameListStart}
                    className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-husrev-ink dark:hover:bg-white/[0.06] dark:hover:text-white"
                    aria-label={t("lists.renameAria")}
                  >
                    <BiEditAlt size={16} />
                  </button>
                )}
                {list && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setExportMenuOpen((v) => !v)}
                      className="dropdown-toggle rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-husrev-ink dark:hover:bg-white/[0.06] dark:hover:text-white"
                      aria-label={t("lists.export.aria")}
                    >
                      <BiDownload size={16} />
                    </button>
                    <Dropdown
                      isOpen={exportMenuOpen}
                      onClose={() => setExportMenuOpen(false)}
                      className="w-48 p-1.5"
                    >
                      <DropdownItem
                        onClick={handleExportListTxt}
                        baseClassName="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        {t("lists.export.txt")}
                      </DropdownItem>
                      <DropdownItem
                        onClick={handleExportListPdf}
                        baseClassName="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        {t("lists.export.pdf")}
                      </DropdownItem>
                    </Dropdown>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-5 dark:bg-husrev-shadow dark:ring-white/[0.06]">
          {isLoading ? (
            <p className="py-4 text-center text-sm text-gray-400">{t("common.loading")}</p>
          ) : (
            <div className="space-y-4">
              {/* Ungrouped items first — always rendered so the list is never
                  left without a way to add a plain (sectionless) item. */}
              <SectionGroup
                listId={id}
                section={null}
                items={ungrouped}
                indexOf={indexOf}
                moveItem={moveItem}
                onDrop={onDrop}
                onAdd={handleAddItem}
                adding={create.isPending}
              />

              {sortedSections.map((section) => (
                <SectionGroup
                  key={section.id}
                  listId={id}
                  section={section}
                  items={itemsBySection.get(String(section.id)) ?? []}
                  indexOf={indexOf}
                  moveItem={moveItem}
                  onDrop={onDrop}
                  onAdd={handleAddItem}
                  adding={create.isPending}
                />
              ))}
            </div>
          )}

          {/* Add a new section. */}
          <form
            onSubmit={handleAddSection}
            className="mt-5 flex gap-2 border-t border-husrev-sand/70 pt-4 dark:border-white/[0.06]"
          >
            <input
              value={sectionDraft}
              onChange={(e) => setSectionDraft(e.target.value)}
              placeholder={t("lists.sections.namePlaceholder")}
              className="husrev-input flex-1"
            />
            <button
              type="submit"
              disabled={!sectionDraft.trim() || createSection.isPending}
              className="husrev-btn-ghost shrink-0 gap-1.5 px-4"
            >
              <BiPlus size={16} />
              {t("lists.sections.add")}
            </button>
          </form>
        </div>
      </div>
    </DndProvider>
  );
}
