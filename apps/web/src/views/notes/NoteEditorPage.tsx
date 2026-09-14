"use client";

import { type RefObject, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { BiMicrophone } from "react-icons/bi";

import PageBreadcrumb from "@/components/common/PageBreadcrumb";
import Button from "@/components/button/Button";
import FormFieldText from "@/components/form/FormFieldText";
import FormFieldTextarea from "@/components/form/FormFieldTextarea";
import FormFieldCheckbox from "@/components/form/FormFieldCheckbox";
import { useCreateNote, useNote, useNoteTags, useUpdateNote } from "@/hooks/useNotes";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";

interface Props {
  id?: number;
  onSaved?: (id: number) => void;
  onCancel?: () => void;
  embedded?: boolean;
  /**
   * When provided, the parent registers a "flush" function here that saves the
   * current form on close (Keep-style auto-save) so accidentally dismissing the
   * modal never loses the note. Set to `null` again on unmount.
   */
  flushRef?: RefObject<(() => Promise<void>) | null>;
}

const NOTE_COLORS = [
  "#FFFFFF",
  "#FFF8B8",
  "#FBE2D5",
  "#D9F2D0",
  "#D4E8F2",
  "#E7DCF5",
  "#FADADD",
];

export default function NoteEditorPage({ id, onSaved, onCancel, embedded, flushRef }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const isNew = !id;
  const isEmbedded = embedded ?? (!!onSaved || !!onCancel);
  const showAlert = alertStore((s) => s.show);

  const { data: note, isLoading } = useNote(id ?? 0);
  const { data: tags = [] } = useNoteTags();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();

  const schema = useMemo(
    () =>
      z.object({
        // Title is optional here — Keep-style, we derive one from the body when
        // left blank (see persist()). This lets the Save button work with a
        // body-only note the same way closing the modal does.
        title: z.string().max(255).optional(),
        bodyMarkdown: z.string().optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional(),
        tagIds: z.array(z.number()).optional(),
        colorHex: z.string().nullable().optional(),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const {
    control,
    handleSubmit,
    reset,
    register,
    watch,
    setValue,
    setFocus,
    getValues,
    formState: { isDirty },
  } = useForm<FormValues>({
    mode: "onBlur",
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      bodyMarkdown: "",
      pinned: false,
      archived: false,
      tagIds: [],
      colorHex: null,
    },
  });

  useEffect(() => {
    if (note) {
      reset({
        title: note.title,
        bodyMarkdown: note.bodyMarkdown ?? "",
        pinned: note.pinned,
        archived: note.archived,
        tagIds: note.tags.map((tag) => tag.id),
        colorHex: note.colorHex,
      });
    }
  }, [note, reset]);

  const selectedTagIds = watch("tagIds") ?? [];

  const toggleTag = (tagId: number) => {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((x) => x !== tagId)
      : [...selectedTagIds, tagId];
    setValue("tagIds", next, { shouldDirty: true });
  };

  // Single source of truth for writing the note. Derives a title from the first
  // body line when the title field is blank (Keep-style), so both the explicit
  // Save button and the auto-save-on-close path behave identically. Returns the
  // note id on success, or null when there was nothing worth saving.
  const persist = useCallback(async (): Promise<number | null> => {
    if (createNote.isPending || updateNote.isPending) return null;
    const data = getValues();
    const titleTrimmed = (data.title ?? "").trim();
    const bodyTrimmed = (data.bodyMarkdown ?? "").trim();
    const title = titleTrimmed || bodyTrimmed.split("\n")[0]?.slice(0, 255) || "";
    const payload = { ...data, title };

    if (isNew) {
      // Nothing typed → don't create an empty/junk note.
      if (!title) return null;
      const res = await createNote.mutateAsync(payload);
      return res.data.id;
    }
    await updateNote.mutateAsync({ id: id!, body: payload });
    return id!;
  }, [createNote, updateNote, getValues, isNew, id]);

  // Explicit Save button (and full-page form submit).
  const handleSave = async () => {
    try {
      const savedId = await persist();
      if (savedId == null) {
        // Only reachable for a brand-new, completely empty note.
        showAlert({
          title: t("notes.titleRequired"),
          message: t("notes.emptyMessage", "Bir başlık ya da içerik gir."),
          type: "error",
          position: "top-center",
        });
        return;
      }
      showAlert({
        title: t("notes.savedTitle"),
        message: isNew ? t("notes.createdMessage") : t("notes.updatedMessage"),
        type: "success",
        position: "top-center",
      });
      if (onSaved) onSaved(savedId);
      else if (isNew) router.push(`/notes/${savedId}`);
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  // Keep-style auto-save on modal close: persist whatever is typed so an
  // accidental dismiss (backdrop / Esc / X) never loses the note. Silent about
  // "nothing to save" cases since the user is just leaving.
  const flush = useCallback(async () => {
    // Untouched existing note → nothing to save.
    if (!isNew && !isDirty) return;
    try {
      const savedId = await persist();
      if (savedId == null) return;
      showAlert({
        title: t("notes.savedTitle"),
        message: isNew ? t("notes.createdMessage") : t("notes.updatedMessage"),
        type: "success",
        position: "top-center",
      });
    } catch (err) {
      const { title, message } = parseAxiosError(err);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  }, [persist, isNew, isDirty, showAlert, t]);

  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = flush;
    return () => {
      flushRef.current = null;
    };
  }, [flushRef, flush]);

  if (!isNew && isLoading) {
    return <p className="text-gray-500">{t("common.loading")}</p>;
  }

  const heading = isNew ? t("notes.newNote") : t("notes.editTitle");

  return (
    <div className="space-y-6">
      {isEmbedded ? (
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{heading}</h2>
      ) : (
        <PageBreadcrumb pageTitle={heading} />
      )}

      <form onSubmit={handleSubmit(handleSave)} className="space-y-5">
        <FormFieldText control={control} name="title" label={t("notes.field.title")} required />

        <div className="relative">
          <FormFieldTextarea
            control={control}
            name="bodyMarkdown"
            label={t("notes.field.body")}
            rows={14}
          />
          <button
            type="button"
            onClick={() => setFocus("bodyMarkdown")}
            title={t("notes.dictateFocusTooltip")}
            aria-label={t("notes.dictateFocusTooltip")}
            className="absolute right-0 top-0 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-brand-500 dark:hover:bg-gray-800"
          >
            <BiMicrophone size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-6">
          <FormFieldCheckbox control={control} name="pinned" label={t("notes.field.pinned")} />
          <FormFieldCheckbox control={control} name="archived" label={t("notes.field.archived")} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {t("notes.field.color")}
          </p>
          <div className="flex flex-wrap gap-2">
            {NOTE_COLORS.map((c) => {
              const isNone = c === "#FFFFFF";
              const selected = (watch("colorHex") ?? null) === (isNone ? null : c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue("colorHex", isNone ? null : c, { shouldDirty: true })}
                  className={`h-8 w-8 rounded-full border transition hover:scale-110 ${
                    selected
                      ? "ring-2 ring-offset-2 ring-husrev-ember ring-offset-white dark:ring-offset-husrev-shadow"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={isNone ? t("notes.colorNone") : c}
                />
              );
            })}
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("notes.field.tags")}
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const on = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={
                      "rounded-full px-3 py-1 text-xs transition " +
                      (on
                        ? "bg-brand-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700")
                    }
                  >
                    #{tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <input type="hidden" {...register("tagIds")} />

        <div className="flex gap-3">
          <Button
            type="submit"
            size="sm"
            disabled={createNote.isPending || updateNote.isPending}
          >
            {createNote.isPending || updateNote.isPending ? t("common.saving") : t("common.save")}
          </Button>
          <button
            type="button"
            onClick={() => (onCancel ? onCancel() : router.push("/notes"))}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
