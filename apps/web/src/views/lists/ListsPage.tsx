"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import DetailModal from "@/components/modal/DetailModal";
import { Dropdown } from "@/components/dropdown/Dropdown";
import { DropdownItem } from "@/components/dropdown/DropdownItem";
import ListDetailPage from "@/views/lists/ListDetailPage";
import {
  useCreateTodoList,
  useDeleteTodoList,
  useReorderTodoLists,
  useRestoreTodoList,
  useTodoLists,
} from "@/hooks/useLists";
import { TodoListResponse } from "@/types/list/list";
import { alertStore, showUndoToast } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { exportAsPdf, exportAsTxt } from "@/utils/export";
import { slugify } from "@/utils/utils";
import { formatDateTime } from "@/utils/i18n-date";
import { BiPlus, BiTrash, BiListUl, BiMenu, BiDownload } from "react-icons/bi";

const DRAG_TYPE = "TODO_LIST_CARD";

interface DragItem {
  index: number;
  id: number;
}

/**
 * Per-list export trigger. `useTodoLists()` only returns list metadata (no
 * items), so this exports the title/status/created-date summary only — open
 * the list to export the full items + sections (see `ListDetailPage`).
 */
function ListExportMenu({ list }: { list: TodoListResponse }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const filename = (ext: "txt" | "pdf") => `lists-${slugify(list.name)}.${ext}`;
  const statusLine = `${t("lists.export.statusLabel")}: ${
    list.archived ? t("lists.archived") : t("lists.openList")
  }`;
  const createdLine = list.createdAt
    ? `${t("lists.export.createdLabel")}: ${formatDateTime(list.createdAt)}`
    : null;

  const handleExportTxt = () => {
    const lines = [list.name, "", statusLine];
    if (createdLine) lines.push(createdLine);
    lines.push("", t("lists.export.summaryHint"));
    exportAsTxt(filename("txt"), lines.join("\n"));
    setOpen(false);
  };

  const handleExportPdf = () => {
    const textLines = [statusLine];
    if (createdLine) textLines.push(createdLine);
    textLines.push("", t("lists.export.summaryHint"));
    exportAsPdf(filename("pdf"), { title: list.name, text: textLines.join("\n") });
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
        className="dropdown-toggle rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
        aria-label={t("lists.export.aria")}
      >
        <BiDownload size={16} />
      </button>
      <Dropdown isOpen={open} onClose={() => setOpen(false)} className="w-48 p-1.5">
        <DropdownItem
          onClick={handleExportTxt}
          baseClassName="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {t("lists.export.txt")}
        </DropdownItem>
        <DropdownItem
          onClick={handleExportPdf}
          baseClassName="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {t("lists.export.pdf")}
        </DropdownItem>
      </Dropdown>
    </div>
  );
}

const PRESET_COLORS = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#FF3B30",
  "#AF52DE",
  "#5AC8FA",
  "#FFCC00",
  "#8E8E93",
];

function ListCard({
  list,
  index,
  moveCard,
  onDrop,
  onDelete,
  onOpen,
}: {
  list: TodoListResponse;
  index: number;
  moveCard: (drag: number, hover: number) => void;
  onDrop: () => void;
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { index, id: list.id },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop();
    },
  });

  const [, dropRef] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(item) {
      if (item.index === index) return;
      moveCard(item.index, index);
      item.index = index;
    },
    drop: () => ({}),
  });

  dragRef(dropRef(ref));

  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0.35 : 1,
        transform: isDragging ? "scale(0.985) rotate(-0.4deg)" : undefined,
      }}
      className="group relative overflow-hidden rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm husrev-lift dark:bg-husrev-shadow dark:ring-white/[0.06]"
    >
      {/* color spine */}
      <span
        className="absolute inset-y-0 left-0 w-[4px] opacity-80 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: list.color ?? "#a14d18" }}
      />

      {/* drag handle */}
      <span
        className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab text-gray-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing dark:text-gray-600"
        aria-hidden
      >
        <BiMenu size={14} className="rotate-90" />
      </span>

      <button
        type="button"
        onClick={() => onOpen(list.id)}
        className="block w-full py-5 pl-7 pr-12 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-white dark:ring-husrev-shadow"
            style={{ backgroundColor: list.color ?? "#a14d18" }}
          />
          <h3 className="text-base font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream truncate group-hover:text-husrev-ember dark:group-hover:text-husrev-amber transition-colors">
            {list.name}
          </h3>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {list.archived ? (
            <span className="husrev-pill">{t("lists.archived")}</span>
          ) : (
            <span className="husrev-kicker text-gray-400 dark:text-gray-500">
              {t("lists.openList")}
            </span>
          )}
        </div>
      </button>

      <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
        <ListExportMenu list={list} />
        <button
          type="button"
          onClick={() => onDelete(list.id)}
          className="rounded-full p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
          aria-label={t("lists.deleteAria")}
        >
          <BiTrash size={16} />
        </button>
      </div>
    </div>
  );
}

function NewListModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const createList = useCreateTodoList();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#007AFF");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const result = await createList.mutateAsync({
        name: name.trim(),
        color,
      });
      onCreated(result.data.id);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {t("lists.modal.kicker")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("lists.modal.title")}{" "}
              <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
                {t("lists.modal.flourish")}
              </span>
            </h3>
          </div>
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <BiListUl size={18} />
          </span>
        </div>

        <div className="husrev-rule mt-5" />

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("lists.modal.nameField")}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("lists.modal.namePlaceholder")}
              className="husrev-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="husrev-kicker text-gray-500 dark:text-gray-400">
              {t("lists.modal.colorField")}
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`relative h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                    color === c
                      ? "ring-2 ring-offset-2 ring-husrev-shadow ring-offset-husrev-cream dark:ring-husrev-cream dark:ring-offset-husrev-shadow"
                      : ""
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="husrev-btn-ghost">
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createList.isPending}
              className="husrev-btn"
            >
              {createList.isPending ? t("lists.modal.submitting") : t("lists.modal.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ListsPage() {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const router = useRouter();
  const { data: lists = [], isLoading } = useTodoLists();
  const reorder = useReorderTodoLists();
  const remove = useDeleteTodoList();
  const restore = useRestoreTodoList();

  const [showModal, setShowModal] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const openList = lists.find((l) => Number(l.id) === openId);
  const sorted = [...lists].sort((a, b) => a.position - b.position);
  const [ordered, setOrdered] = useState<TodoListResponse[]>(sorted);
  const orderedRef = useRef<TodoListResponse[]>(sorted);
  const dragging = useRef(false);

  useEffect(() => {
    if (!dragging.current) {
      const next = [...lists].sort((a, b) => a.position - b.position);
      setOrdered(next);
      orderedRef.current = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists]);

  const moveCard = useCallback((drag: number, hover: number) => {
    dragging.current = true;
    setOrdered((prev) => {
      const next = [...prev];
      const [item] = next.splice(drag, 1);
      next.splice(hover, 0, item);
      orderedRef.current = next;
      return next;
    });
  }, []);

  const onDrop = useCallback(() => {
    dragging.current = false;
    const items = orderedRef.current.map((l, i) => ({ id: l.id, position: i }));
    reorder.mutate(items);
  }, [reorder]);

  const handleDelete = async (id: number) => {
    const list = lists.find((l) => l.id === id);
    try {
      await remove.mutateAsync(id);
      showUndoToast({
        message: t("lists.undo.listDeleted", { name: list?.name ?? "" }),
        onUndo: () => restore.mutateAsync(id),
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <>
      <DndProvider backend={HTML5Backend}>
      <div className="space-y-6">
        <PageBreadcrumb
          pageTitle={t("lists.title")}
          kicker={t("lists.kicker")}
          flourish={t("lists.flourish")}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {t("lists.introBefore")}{" "}
            <span className="font-instrument-serif italic text-husrev-ember dark:text-husrev-amber">
              {t("lists.introEm")}
            </span>{" "}
            {t("lists.introAfter")}
          </p>
          <button onClick={() => setShowModal(true)} className="husrev-btn">
            <BiPlus size={16} /> {t("lists.newList")}
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl ring-1 ring-husrev-sand/90 bg-white/60 animate-pulse dark:bg-husrev-shadow/60 dark:ring-white/[0.06]"
              />
            ))}
          </div>
        ) : ordered.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl ring-1 ring-dashed ring-husrev-sand bg-husrev-cream/50 grain p-12 text-center dark:bg-husrev-shadow/60 dark:ring-white/[0.06]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-husrev-amber/15 text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber">
              <BiListUl size={22} />
            </div>
            <h3 className="mt-5 text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("lists.empty.title")}{" "}
              <span className="font-instrument-serif italic font-normal text-husrev-ember dark:text-husrev-amber">
                {t("lists.empty.flourish")}
              </span>{" "}
              {t("lists.empty.suffix")}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
              {t("lists.empty.body")}
            </p>
            <button onClick={() => setShowModal(true)} className="husrev-btn mt-6">
              <BiPlus size={16} /> {t("lists.empty.cta")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 husrev-stagger">
            {ordered.map((list, index) => (
              <ListCard
                key={list.id}
                list={list}
                index={index}
                moveCard={moveCard}
                onDrop={onDrop}
                onDelete={handleDelete}
                onOpen={(id) => setOpenId(Number(id))}
              />
            ))}
          </div>
        )}

      </div>
      </DndProvider>

      {showModal && (
        <NewListModal onClose={() => setShowModal(false)} onCreated={() => undefined} />
      )}

      <DetailModal
        isOpen={openId !== null}
        onClose={() => setOpenId(null)}
        onExpand={openId !== null ? () => router.push(`/lists/${openId}`) : undefined}
        title={openList?.name}
      >
        {openId !== null && (
          <ListDetailPage id={openId} embedded onClose={() => setOpenId(null)} />
        )}
      </DetailModal>
    </>
  );
}
