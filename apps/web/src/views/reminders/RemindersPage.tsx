"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import {
  useReminderLists,
  useCreateReminderList,
  useDeleteReminderList,
  useReminders,
  useCreateReminder,
  useToggleReminder,
  useUpdateReminder,
  useDeleteReminder,
  useReorderReminders,
  useReorderReminderLists,
} from "@/hooks/useReminders";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { formatDateTime } from "@/utils/i18n-date";
import {
  ReminderListResponse,
  ReminderResponse,
  ReminderPriority,
} from "@/types/reminder/reminder";
import { BiTrash, BiFlag, BiSolidFlag, BiPlus, BiCalendarPlus } from "react-icons/bi";
import { BsCheckCircleFill, BsCircle } from "react-icons/bs";

// ─── Priority helpers ─────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<ReminderPriority, string> = {
  NONE: "",
  LOW: "text-husrev-moss",
  MEDIUM: "text-husrev-amber",
  HIGH: "text-red-500",
};

const PRIORITY_CYCLE: ReminderPriority[] = ["NONE", "LOW", "MEDIUM", "HIGH"];

function nextPriority(p: ReminderPriority): ReminderPriority {
  const i = PRIORITY_CYCLE.indexOf(p);
  return PRIORITY_CYCLE[(i + 1) % PRIORITY_CYCLE.length];
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

type ReminderPatch = Partial<{
  dueAt: string | null;
  priority: ReminderPriority;
  flag: boolean;
}>;

function toReminderRequest(r: ReminderResponse, patch: ReminderPatch) {
  return {
    listId: r.listId,
    title: r.title,
    notes: r.notes,
    dueAt: r.dueAt,
    priority: r.priority,
    flag: r.flag,
    ...patch,
  };
}

type SmartGroup = "all" | "today" | "scheduled" | "flagged" | "completed";

function inSmartGroup(r: ReminderResponse, g: SmartGroup): boolean {
  if (g === "all") return true;
  if (g === "flagged") return r.flag;
  if (g === "completed") return !!r.completedAt;
  if (g === "scheduled") return !!r.dueAt;
  // today
  if (!r.dueAt) return false;
  const d = new Date(r.dueAt);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ─── Drag types ───────────────────────────────────────────────────────────────

const DRAG_TYPE = "REMINDER_ITEM";
const LIST_DRAG_TYPE = "REMINDER_LIST";

interface DragItem {
  index: number;
  id: number;
}

// ─── Draggable reminder row ───────────────────────────────────────────────────

function ReminderRow({
  reminder,
  index,
  listId,
  moveItem,
  onDrop,
}: {
  reminder: ReminderResponse;
  index: number;
  listId: number;
  moveItem: (drag: number, hover: number) => void;
  onDrop: () => void;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const toggleReminder = useToggleReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();
  const [editingDue, setEditingDue] = useState(false);

  const commit = async (patch: ReminderPatch) => {
    try {
      await updateReminder.mutateAsync({
        id: reminder.id,
        body: toReminderRequest(reminder, patch),
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: DRAG_TYPE,
    item: { index, id: reminder.id },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop();
    },
  });

  const [, dropRef] = useDrop<DragItem>({
    accept: DRAG_TYPE,
    hover(item) {
      if (item.index === index) return;
      moveItem(item.index, index);
      item.index = index;
    },
    drop: () => ({}),
  });

  dragRef(dropRef(ref));

  const handleToggle = async () => {
    try {
      await toggleReminder.mutateAsync({ id: reminder.id, listId });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteReminder.mutateAsync({ id: reminder.id, listId });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const isCompleted = !!reminder.completedAt;

  return (
    <div
      ref={ref}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="group flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-gray-50 dark:hover:bg-gray-800"
    >
      <button
        type="button"
        onClick={handleToggle}
        className="shrink-0 text-gray-400 transition hover:text-brand-500"
        aria-label={isCompleted ? t("reminders.toggle.incomplete") : t("reminders.toggle.complete")}
      >
        {isCompleted ? (
          <BsCheckCircleFill size={20} className="text-brand-500" />
        ) : (
          <BsCircle size={20} />
        )}
      </button>

      <div className="flex flex-1 flex-col min-w-0">
        <span
          className={`truncate text-sm font-medium ${
            isCompleted
              ? "line-through text-gray-400 dark:text-gray-500"
              : "text-gray-800 dark:text-white/90"
          }`}
        >
          {reminder.title}
        </span>
        {editingDue ? (
          <input
            type="datetime-local"
            autoFocus
            defaultValue={toLocalInput(reminder.dueAt)}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={() => setEditingDue(false)}
            onChange={(e) => {
              if (e.target.value) commit({ dueAt: fromLocalInput(e.target.value) });
              setEditingDue(false);
            }}
            className="mt-0.5 w-fit rounded border border-gray-200 bg-white px-1 py-0.5 text-xs outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
          />
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingDue(true);
            }}
            className="flex w-fit items-center gap-1 text-left text-xs text-gray-400 transition hover:text-brand-500"
          >
            {reminder.dueAt ? (
              formatDateTime(reminder.dueAt, {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            ) : (
              <>
                <BiCalendarPlus size={12} /> {t("reminders.addDue")}
              </>
            )}
          </button>
        )}
        {reminder.notes && <span className="text-xs text-gray-400 truncate">{reminder.notes}</span>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => commit({ flag: !reminder.flag })}
          className={`rounded-full p-1 transition ${
            reminder.flag
              ? "text-red-500"
              : "text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-500"
          }`}
          aria-label={t("reminders.flagAria")}
        >
          {reminder.flag ? <BiSolidFlag size={14} /> : <BiFlag size={14} />}
        </button>
        <button
          type="button"
          onClick={() => commit({ priority: nextPriority(reminder.priority) })}
          className={`rounded px-1 text-xs font-medium transition ${
            reminder.priority !== "NONE"
              ? PRIORITY_COLORS[reminder.priority]
              : "text-gray-400 opacity-0 group-hover:opacity-100"
          }`}
          aria-label={t("reminders.priorityAria")}
        >
          {reminder.priority === "NONE" ? "!" : t(`reminders.priority.${reminder.priority}`)}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-full p-1 text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
          aria-label={t("reminders.deleteAria")}
        >
          <BiTrash size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Reminders panel ─────────────────────────────────────────────────────────

function RemindersPanel({ list }: { list: ReminderListResponse }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const createReminder = useCreateReminder();
  const reorderReminders = useReorderReminders();

  const { data: serverReminders = [], isLoading } = useReminders(list.id);
  const [ordered, setOrdered] = useState<ReminderResponse[]>(serverReminders);
  const orderedRef = useRef<ReminderResponse[]>(serverReminders);
  const dragging = useRef(false);
  const [newTitle, setNewTitle] = useState("");
  const [group, setGroup] = useState<SmartGroup>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = ordered.filter((r) => inSmartGroup(r, group));

  useEffect(() => {
    if (!dragging.current) {
      const sorted = [...serverReminders].sort((a, b) => a.position - b.position);
      setOrdered(sorted);
      orderedRef.current = sorted;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverReminders]);

  const moveItem = useCallback((dragIdx: number, hoverIdx: number) => {
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
    const items = orderedRef.current.map((r, i) => ({ id: r.id, position: i }));
    reorderReminders.mutate({ items, listId: list.id });
  }, [reorderReminders, list.id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      await createReminder.mutateAsync({ listId: list.id, title });
      setNewTitle("");
      inputRef.current?.focus();
    } catch (err) {
      const { title: errTitle, message } = parseAxiosError(err);
      showAlert({ title: errTitle, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: list.color }} />
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">{list.name}</h2>
        <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {list.itemCount}
        </span>
      </div>

      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <input
          ref={inputRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={t("reminders.newReminderPlaceholder")}
          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={!newTitle.trim() || createReminder.isPending}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-50"
          aria-label={t("common.add")}
        >
          <BiPlus size={18} />
        </button>
      </form>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["all", "today", "scheduled", "flagged", "completed"] as SmartGroup[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGroup(g)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              group === g
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {t(`reminders.group.${g}`)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="py-4 text-center text-sm text-gray-400">{t("common.loading")}</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">{t("reminders.noReminders")}</p>
        ) : (
          <div className="space-y-0.5">
            {visible.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                index={ordered.indexOf(reminder)}
                listId={list.id}
                moveItem={moveItem}
                onDrop={onDrop}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── New list modal ───────────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#007AFF",
  "#34C759",
  "#FF9500",
  "#FF3B30",
  "#AF52DE",
  "#FF2D55",
  "#5AC8FA",
  "#4CD964",
];

function NewListModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const createList = useCreateReminderList();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#007AFF");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const result = await createList.mutateAsync({ name: name.trim(), color });
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
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="space-y-1.5">
          <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
            {t("reminders.modal.kicker", "Yeni liste")}
          </span>
          <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
            {t("reminders.modal.title")}
          </h3>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("reminders.modal.nameField")}
            </span>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("reminders.modal.nameField")}
              className="husrev-input"
            />
          </label>

          <div className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("reminders.modal.colorField", "Renk")}
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`h-8 w-8 rounded-full transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-husrev-amber ${
                    color === c
                      ? "ring-2 ring-offset-2 ring-offset-husrev-cream ring-husrev-ember dark:ring-offset-husrev-ink"
                      : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={createList.isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!name.trim() || createList.isPending}
            className="husrev-btn"
          >
            {createList.isPending
              ? t("common.saving", "Kaydediliyor…")
              : t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function ReminderListRow({
  list,
  index,
  selected,
  onSelect,
  onDelete,
  moveList,
  onDrop,
}: {
  list: ReminderListResponse;
  index: number;
  selected: boolean;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  moveList: (drag: number, hover: number) => void;
  onDrop: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLLIElement>(null);

  const [{ isDragging }, dragRef] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: LIST_DRAG_TYPE,
    item: { index, id: list.id },
    collect: (m) => ({ isDragging: m.isDragging() }),
    end: (_item, monitor) => {
      if (monitor.didDrop()) onDrop();
    },
  });

  const [, dropRef] = useDrop<DragItem>({
    accept: LIST_DRAG_TYPE,
    hover(item) {
      if (item.index === index) return;
      moveList(item.index, index);
      item.index = index;
    },
    drop: () => ({}),
  });

  dragRef(dropRef(ref));

  return (
    <li ref={ref} className={isDragging ? "opacity-50" : ""}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(list.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(list.id);
          }
        }}
        className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
          selected
            ? "bg-brand-50 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        }`}
      >
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: list.color }}
        />
        <span className="flex-1 truncate">{list.name}</span>
        <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          {list.itemCount}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(list.id);
          }}
          className="ml-auto shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition-colors duration-200 group-hover:opacity-100 hover:text-red-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          aria-label={t("reminders.deleteAria")}
        >
          <BiTrash size={13} />
        </button>
      </div>
    </li>
  );
}

export default function RemindersPage({
  initialListId,
}: {
  initialListId?: number;
} = {}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const { data: lists = [], isLoading } = useReminderLists();
  const deleteList = useDeleteReminderList();
  const reorderLists = useReorderReminderLists();

  const [selectedListId, setSelectedListId] = useState<number | null>(initialListId ?? null);
  const [showNewListModal, setShowNewListModal] = useState(false);

  const [orderedLists, setOrderedLists] = useState<ReminderListResponse[]>([]);
  const orderedListsRef = useRef<ReminderListResponse[]>([]);
  const draggingList = useRef(false);

  useEffect(() => {
    if (!draggingList.current) {
      const sorted = [...lists].sort((a, b) => a.position - b.position);
      setOrderedLists(sorted);
      orderedListsRef.current = sorted;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists]);

  const moveList = useCallback((dragIdx: number, hoverIdx: number) => {
    draggingList.current = true;
    setOrderedLists((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIdx, 1);
      next.splice(hoverIdx, 0, item);
      orderedListsRef.current = next;
      return next;
    });
  }, []);

  const onListDrop = useCallback(() => {
    draggingList.current = false;
    const items = orderedListsRef.current.map((l, i) => ({ id: l.id, position: i }));
    reorderLists.mutate(items);
  }, [reorderLists]);

  // Auto-select first list when data loads (only when no selection yet)
  useEffect(() => {
    if (lists.length === 0) return;
    if (selectedListId !== null && lists.some((l) => l.id === selectedListId)) {
      return;
    }
    setSelectedListId(lists[0].id);
  }, [lists, selectedListId]);

  const selectedList = lists.find((l) => l.id === selectedListId) ?? null;

  const handleDeleteList = async (id: number) => {
    try {
      await deleteList.mutateAsync(id);
      if (selectedListId === id) {
        setSelectedListId(lists.find((l) => l.id !== id)?.id ?? null);
      }
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <>
      <DndProvider backend={HTML5Backend}>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <PageBreadcrumb pageTitle={t("reminders.title")} />

        <div className="flex min-h-0 flex-1 gap-4 rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
          {/* Left sidebar — list of reminder lists */}
          <div className="w-56 shrink-0 border-r border-gray-200 p-3 dark:border-gray-700">
            {isLoading ? (
              <p className="py-4 text-center text-xs text-gray-400">{t("common.loading")}</p>
            ) : (
              <ul className="space-y-0.5">
                {orderedLists.map((list, index) => (
                  <ReminderListRow
                    key={list.id}
                    list={list}
                    index={index}
                    selected={selectedListId === list.id}
                    onSelect={setSelectedListId}
                    onDelete={handleDeleteList}
                    moveList={moveList}
                    onDrop={onListDrop}
                  />
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setShowNewListModal(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-brand-500 transition hover:bg-brand-50 dark:hover:bg-brand-500/10"
            >
              <BiPlus size={16} />
              {t("reminders.newList")}
            </button>
          </div>

          {/* Right panel — reminders for selected list */}
          <div className="flex-1 p-5">
            {selectedList ? (
              <RemindersPanel list={selectedList} />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                {lists.length === 0 ? t("reminders.noLists") : t("reminders.selectList")}
              </div>
            )}
          </div>
        </div>
      </div>
      </DndProvider>

      {showNewListModal && (
        <NewListModal
          onClose={() => setShowNewListModal(false)}
          onCreated={(id) => setSelectedListId(id)}
        />
      )}
    </>
  );
}
