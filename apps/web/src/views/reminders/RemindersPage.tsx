"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import { Dropdown } from "@/components/dropdown/Dropdown";
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

// ─── Due-date presets (all at 09:00 local) ────────────────────────────────────

type DuePreset = "today" | "tomorrow" | "thisWeek" | "thisMonth";

const DUE_PRESETS: DuePreset[] = ["today", "tomorrow", "thisWeek", "thisMonth"];

function presetDueAt(p: DuePreset): string {
  const now = new Date();
  let d: Date;
  if (p === "today") {
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (p === "tomorrow") {
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else if (p === "thisWeek") {
    // end of week = this week's Sunday (Monday-started week)
    const day = now.getDay(); // 0=Sun..6=Sat
    const untilSunday = (7 - day) % 7; // 0 when today is Sunday
    d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + untilSunday);
  } else {
    // last day of this month
    d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

// ─── Date-range filter helpers ────────────────────────────────────────────────

function isSameDay(d: Date, ref: Date): boolean {
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function isThisWeek(d: Date, now: Date): boolean {
  // Monday-started week containing `now`
  const day = now.getDay(); // 0=Sun..6=Sat
  const sinceMonday = (day + 6) % 7; // 0 when Monday
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return d >= start && d < end;
}

function isThisMonth(d: Date, now: Date): boolean {
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
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

type SmartGroup =
  | "all"
  | "today"
  | "tomorrow"
  | "thisWeek"
  | "thisMonth"
  | "flagged"
  | "scheduled";

const SMART_GROUPS: SmartGroup[] = [
  "all",
  "today",
  "tomorrow",
  "thisWeek",
  "thisMonth",
  "flagged",
  "scheduled",
];

function inSmartGroup(r: ReminderResponse, g: SmartGroup): boolean {
  if (g === "all") return true;
  if (g === "flagged") return r.flag;
  if (g === "scheduled") return !!r.dueAt;
  if (!r.dueAt) return false;
  const d = new Date(r.dueAt);
  const now = new Date();
  if (g === "today") return isSameDay(d, now);
  if (g === "tomorrow") {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return isSameDay(d, tomorrow);
  }
  if (g === "thisWeek") return isThisWeek(d, now);
  // thisMonth
  return isThisMonth(d, now);
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
  const [dueOpen, setDueOpen] = useState(false);
  const [editing, setEditing] = useState(false);

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
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          title={t("reminders.editAria", "Düzenle")}
          className={`truncate text-left text-sm font-medium transition hover:text-brand-500 ${
            isCompleted
              ? "line-through text-gray-400 dark:text-gray-500"
              : "text-gray-800 dark:text-white/90"
          }`}
        >
          {reminder.title}
        </button>
        <div className="relative w-fit">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setDueOpen((v) => !v);
            }}
            className="dropdown-toggle flex w-fit items-center gap-1 text-left text-xs text-gray-400 transition hover:text-brand-500"
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

          <Dropdown
            isOpen={dueOpen}
            onClose={() => setDueOpen(false)}
            className="left-0 right-auto w-56 p-3"
          >
            <div onPointerDown={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap gap-1.5">
                {DUE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      commit({ dueAt: presetDueAt(p) });
                      setDueOpen(false);
                    }}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-brand-50 hover:text-brand-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                  >
                    {t(`reminders.due.${p}`)}
                  </button>
                ))}
              </div>

              <input
                type="datetime-local"
                value={toLocalInput(reminder.dueAt)}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  if (e.target.value) {
                    commit({ dueAt: fromLocalInput(e.target.value) });
                    setDueOpen(false);
                  }
                }}
                className="mt-3 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
              />

              {reminder.dueAt && (
                <button
                  type="button"
                  onClick={() => {
                    commit({ dueAt: null });
                    setDueOpen(false);
                  }}
                  className="mt-2 w-full rounded px-2 py-1 text-left text-xs text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
                >
                  {t("reminders.due.clear")}
                </button>
              )}
            </div>
          </Dropdown>
        </div>
        {reminder.notes && <span className="text-xs text-gray-400 truncate">{reminder.notes}</span>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => commit({ flag: !reminder.flag })}
          className={`rounded-full p-1 transition ${
            reminder.flag
              ? "text-red-500"
              : "text-gray-400 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
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
              : "text-gray-400 md:opacity-0 md:group-hover:opacity-100"
          }`}
          aria-label={t("reminders.priorityAria")}
        >
          {reminder.priority === "NONE" ? "!" : t(`reminders.priority.${reminder.priority}`)}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-full p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 dark:hover:bg-red-500/10"
          aria-label={t("reminders.deleteAria")}
        >
          <BiTrash size={14} />
        </button>
      </div>

      {editing && (
        <ReminderEditModal
          reminder={reminder}
          listId={listId}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ─── Edit reminder modal ───────────────────────────────────────────────────────

function ReminderEditModal({
  reminder,
  listId,
  onClose,
}: {
  reminder: ReminderResponse;
  listId: number;
  onClose: () => void;
}) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();

  const [title, setTitle] = useState(reminder.title);
  const [notes, setNotes] = useState(reminder.notes ?? "");
  const [priority, setPriority] = useState<ReminderPriority>(reminder.priority);
  const [dueAt, setDueAt] = useState(toLocalInput(reminder.dueAt));
  const [flag, setFlag] = useState(reminder.flag);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await updateReminder.mutateAsync({
        id: reminder.id,
        body: {
          listId: reminder.listId,
          title: title.trim(),
          notes: notes.trim() || null,
          dueAt: dueAt ? fromLocalInput(dueAt) : null,
          priority,
          flag,
        },
      });
      onClose();
    } catch (err) {
      const { title: errTitle, message } = parseAxiosError(err);
      showAlert({ title: errTitle, message, type: "error", position: "top-center" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteReminder.mutateAsync({ id: reminder.id, listId });
      onClose();
    } catch (err) {
      const { title: errTitle, message } = parseAxiosError(err);
      showAlert({ title: errTitle, message, type: "error", position: "top-center" });
    }
  };

  const pending = updateReminder.isPending || deleteReminder.isPending;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-3xl husrev-modal grain p-7 husrev-settle"
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="space-y-1">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {t("reminders.edit.kicker", "Düzenle")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {t("reminders.edit.title", "Anımsatıcı")}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            aria-label={t("reminders.deleteAria")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
          >
            <BiTrash className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("reminders.edit.titleField", "Başlık")}
            </span>
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              className="husrev-input"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="husrev-kicker text-gray-600 dark:text-gray-300">
              {t("reminders.edit.notesField", "Not")}
            </span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="husrev-input resize-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="husrev-kicker text-gray-600 dark:text-gray-300">
                {t("reminders.edit.priorityField", "Öncelik")}
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ReminderPriority)}
                className="husrev-input"
              >
                <option value="NONE">{t("reminders.priority.NONE", "Yok")}</option>
                <option value="LOW">{t("reminders.priority.LOW", "Düşük")}</option>
                <option value="MEDIUM">{t("reminders.priority.MEDIUM", "Orta")}</option>
                <option value="HIGH">{t("reminders.priority.HIGH", "Yüksek")}</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="husrev-kicker text-gray-600 dark:text-gray-300">
                {t("reminders.edit.dueField", "Tarih")}
              </span>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="husrev-input"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => setFlag((v) => !v)}
            aria-pressed={flag}
            className={`flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left ring-1 transition ${
              flag
                ? "bg-red-50 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30"
                : "bg-husrev-sand/40 ring-husrev-sand/70 dark:bg-white/[0.04] dark:ring-white/[0.06]"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-husrev-ink dark:text-husrev-cream">
              {flag ? (
                <BiSolidFlag className="h-4 w-4 text-red-500" />
              ) : (
                <BiFlag className="h-4 w-4 text-gray-400" />
              )}
              {t("reminders.edit.flagField", "Bayrak")}
            </span>
            <span
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                flag ? "bg-red-500" : "bg-gray-300 dark:bg-white/20"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  flag ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel", "İptal")}
          </button>
          <button
            type="submit"
            disabled={!title.trim() || pending}
            className="husrev-btn"
          >
            {updateReminder.isPending
              ? t("common.saving", "Kaydediliyor…")
              : t("common.save", "Kaydet")}
          </button>
        </div>
      </form>
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
  const [showCompleted, setShowCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = ordered
    .filter((r) => inSmartGroup(r, group))
    .filter((r) => showCompleted || !r.completedAt);

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

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {SMART_GROUPS.map((g) => (
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
        <button
          type="button"
          onClick={() => setShowCompleted((v) => !v)}
          className={`ml-auto rounded-full px-3 py-1 text-xs font-medium transition ${
            showCompleted
              ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          {showCompleted ? t("reminders.hideCompleted") : t("reminders.showCompleted")}
        </button>
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

        {/* Mobile list selector — horizontal scrolling pills (sidebar is hidden < md) */}
        <div className="md:hidden">
          {isLoading ? (
            <p className="py-2 text-center text-xs text-gray-400">{t("common.loading")}</p>
          ) : (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {orderedLists.map((list) => {
                const isSel = selectedListId === list.id;
                return (
                  <div
                    key={list.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedListId(list.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedListId(list.id);
                      }
                    }}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                      isSel
                        ? "border-brand-500 bg-brand-50 font-medium text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300"
                        : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: list.color }}
                    />
                    <span className="max-w-[8rem] truncate">{list.name}</span>
                    {isSel ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteList(list.id);
                        }}
                        className="-mr-1 rounded-full p-0.5 text-brand-500/70 transition hover:text-red-500"
                        aria-label={t("reminders.deleteAria")}
                      >
                        <BiTrash size={13} />
                      </button>
                    ) : (
                      <span className="rounded-full bg-gray-200 px-1.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        {list.itemCount}
                      </span>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setShowNewListModal(true)}
                className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-brand-300 px-3 py-1.5 text-sm text-brand-500 transition hover:bg-brand-50 dark:border-brand-500/40 dark:hover:bg-brand-500/10"
              >
                <BiPlus size={16} />
                {t("reminders.newList")}
              </button>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 gap-4 rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm dark:bg-husrev-shadow dark:ring-white/[0.06]">
          {/* Left sidebar — list of reminder lists (desktop only; mobile uses the pill selector above) */}
          <div className="hidden w-56 shrink-0 flex-col border-r border-gray-200 p-3 md:flex dark:border-gray-700">
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
          <div className="min-w-0 flex-1 p-4 md:p-5">
            {selectedList ? (
              <RemindersPanel list={selectedList} />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-400">
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
