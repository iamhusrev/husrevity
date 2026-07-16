"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BiRefresh, BiTrash } from "react-icons/bi";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin, { DateClickArg } from "@fullcalendar/interaction";
import { DatesSetArg, EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";
import trLocale from "@fullcalendar/core/locales/tr";
import enGbLocale from "@fullcalendar/core/locales/en-gb";
import { useTranslation } from "react-i18next";
import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import DateTimePicker from "@/components/datetime/DateTimePicker";

// Stable references — recreating these arrays on every render makes
// FullCalendar see new prop identities, fire `datesSet` after each
// re-render, and trigger `Maximum update depth exceeded`.
const FC_LOCALES = [trLocale, enGbLocale];
const FC_PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin];
import {
  useCalendarEvents,
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
} from "@/hooks/useCalendarEvents";
import { EventResponse } from "@/types/calendar/calendar-event";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

interface EditingEvent {
  id?: number;
  title: string;
  description?: string | null;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  location?: string | null;
  colorHex?: string | null;
}

// Backend requires endAt. When the user leaves it blank, default to start + 1h.
function defaultEndIso(startIso: string): string {
  return new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
}

function EventModal({ initial, onClose }: { initial: EditingEvent; onClose: () => void }) {
  const showAlert = alertStore((s) => s.show);
  const { t } = useTranslation();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [start, setStart] = useState<string | null>(initial.startAt ?? null);
  const [end, setEnd] = useState<string | null>(initial.endAt ?? null);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [location, setLocation] = useState(initial.location ?? "");
  const [colorHex, setColorHex] = useState(initial.colorHex ?? "#007AFF");

  const isEdit = !!initial.id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !start) return;
    const body = {
      title: title.trim(),
      description: description || null,
      startAt: start,
      endAt: end ?? defaultEndIso(start),
      allDay,
      location: location || null,
      colorHex,
    };
    try {
      if (isEdit && initial.id) {
        await update.mutateAsync({ id: initial.id, body });
      } else {
        await create.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      const { title: errTitle, message } = parseAxiosError(err);
      showAlert({
        title: errTitle,
        message,
        type: "error",
        position: "top-center",
      });
    }
  };

  const handleDelete = async () => {
    if (!initial.id) return;
    try {
      await remove.mutateAsync(initial.id);
      onClose();
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  const isPending = create.isPending || update.isPending || remove.isPending;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-husrev-ink/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl husrev-modal grain p-5 sm:p-7 husrev-settle"
      >
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <span className="husrev-kicker text-husrev-ember/80 dark:text-husrev-amber/80">
              {isEdit
                ? t("calendar.modal.kickerEdit", "Düzenle")
                : t("calendar.modal.kickerNew", "Yeni etkinlik")}
            </span>
            <h3 className="text-2xl font-semibold tracking-tight text-husrev-ink dark:text-husrev-cream">
              {isEdit ? t("calendar.editEvent") : t("calendar.newEvent")}
            </h3>
          </div>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              aria-label={t("common.delete")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-error-50 hover:text-error-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-error-500 disabled:opacity-50"
            >
              <BiTrash className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-6 space-y-4">
          <CalField label={t("calendar.field.title")}>
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("calendar.field.title")}
              className="husrev-input"
            />
          </CalField>

          <CalField label={t("calendar.field.description")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("calendar.field.description")}
              rows={2}
              className="husrev-input resize-none"
            />
          </CalField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CalField label={t("calendar.field.start")}>
              <DateTimePicker value={start} onChange={setStart} clearable={false} />
            </CalField>
            <CalField label={t("calendar.field.end")}>
              <DateTimePicker value={end} onChange={setEnd} />
            </CalField>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-husrev-sand text-husrev-ember focus:ring-husrev-amber"
            />
            {t("calendar.field.allDay")}
          </label>

          <CalField label={t("calendar.field.location")}>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("calendar.field.location")}
              className="husrev-input"
            />
          </CalField>

          <CalField label={t("calendar.field.color")}>
            <input
              type="color"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              className="h-10 w-20 cursor-pointer rounded-lg border border-husrev-sand bg-white p-1 dark:border-white/10 dark:bg-husrev-shadow"
            />
          </CalField>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="husrev-btn-ghost"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !start || isPending}
            className="husrev-btn"
          >
            {isPending
              ? t("common.saving", "Kaydediliyor…")
              : isEdit
                ? t("common.save")
                : t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}

function CalField({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="husrev-kicker text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

function toFullCalendarEvent(e: EventResponse): EventInput {
  return {
    id: String(e.id),
    title: e.title,
    start: e.startAt,
    end: e.endAt ?? undefined,
    allDay: e.allDay,
    color: e.colorHex ?? undefined,
    extendedProps: { raw: e },
  };
}

export default function CalendarPage() {
  const showAlert = alertStore((s) => s.show);
  const { t, i18n } = useTranslation();
  const update = useUpdateEvent();

  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [editing, setEditing] = useState<EditingEvent | null>(null);
  const calendarRef = useRef<FullCalendar | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Below md the month grid is unusable (it needs ~718px); fall back to the
  // agenda list view and a compact toolbar on small screens.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    calendarRef.current
      ?.getApi()
      .changeView(isMobile ? "listWeek" : "dayGridMonth");
  }, [isMobile]);

  const qc = useQueryClient();
  const { data: events = [], isFetching } = useCalendarEvents(range);

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["calendar-events"] });
  };

  const handleDatesSet = (arg: DatesSetArg) => {
    setRange({
      from: arg.start.toISOString(),
      to: arg.end.toISOString(),
    });
  };

  const handleDateClick = (arg: DateClickArg) => {
    setEditing({
      title: "",
      startAt: arg.date.toISOString(),
      endAt: null,
      allDay: arg.allDay,
    });
  };

  const handleEventClick = (arg: EventClickArg) => {
    const raw = arg.event.extendedProps?.raw as EventResponse | undefined;
    if (!raw) return;
    setEditing({
      id: raw.id,
      title: raw.title,
      description: raw.description,
      startAt: raw.startAt,
      endAt: raw.endAt,
      allDay: raw.allDay,
      location: raw.location,
      colorHex: raw.colorHex,
    });
  };

  const handleEventDrop = async (arg: EventDropArg) => {
    const raw = arg.event.extendedProps?.raw as EventResponse | undefined;
    if (!raw) return;
    try {
      await update.mutateAsync({
        id: raw.id,
        body: {
          title: raw.title,
          description: raw.description,
          startAt: arg.event.start?.toISOString() ?? raw.startAt,
          endAt: arg.event.end?.toISOString() ?? raw.endAt,
          allDay: arg.event.allDay,
          location: raw.location,
          colorHex: raw.colorHex,
          reminderMinutes: raw.reminderMinutes,
          recurrenceRule: raw.recurrenceRule,
        },
      });
    } catch (err) {
      arg.revert();
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <PageBreadcrumb pageTitle={t("calendar.title")} />
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border border-husrev-sand px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors duration-200 hover:bg-husrev-cream hover:text-husrev-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-husrev-amber"
        >
          <BiRefresh size={14} className={isFetching ? "animate-spin" : ""} />{" "}
          {t("calendar.refresh")}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl ring-1 ring-husrev-sand/90 bg-white shadow-card-warm p-4 dark:bg-husrev-shadow dark:ring-white/[0.06]">
        <FullCalendar
          ref={calendarRef}
          plugins={FC_PLUGINS}
          initialView={isMobile ? "listWeek" : "dayGridMonth"}
          headerToolbar={
            isMobile
              ? {
                  left: "prev,next",
                  center: "title",
                  right: "listWeek,dayGridMonth",
                }
              : {
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
                }
          }
          locales={FC_LOCALES}
          locale={(i18n.language ?? "en").split("-")[0] === "tr" ? "tr" : "en-gb"}
          firstDay={1}
          height="100%"
          editable
          selectable
          events={events.map(toFullCalendarEvent)}
          datesSet={handleDatesSet}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventDrop as never}
        />
      </div>

      {editing && <EventModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
