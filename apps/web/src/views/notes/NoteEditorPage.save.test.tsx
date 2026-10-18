import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import NoteEditorPage from "./NoteEditorPage";
import * as useNotesModule from "@/hooks/useNotes";
import { alertStore } from "@/stores/alert-store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/common/PageBreadcrumb", () => ({ default: () => <div /> }));
vi.mock("./NoteLinksPanel", () => ({ default: () => <div data-testid="links-panel" /> }));
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  };
});

// The API serialises bigint ids as strings ("7"), so the fixtures use string ids
// exactly as they arrive over the wire, even though the TS types still say number.
const TAGS = [
  { id: "7", name: "a" },
  { id: "8", name: "b" },
];

function existingNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "42",
    title: "My note",
    bodyMarkdown: "body",
    pinned: false,
    archived: false,
    position: 0,
    colorHex: null,
    tags: [{ id: "7", name: "a" }],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("NoteEditorPage save", () => {
  let note: ReturnType<typeof existingNote> | undefined;
  let createMutateAsync: ReturnType<typeof vi.fn>;
  let updateMutateAsync: ReturnType<typeof vi.fn>;
  let updatePending: boolean;
  let show: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    note = existingNote();
    updatePending = false;
    createMutateAsync = vi.fn().mockResolvedValue({ data: { id: "99" } });
    updateMutateAsync = vi.fn().mockResolvedValue({ data: {} });
    vi.spyOn(useNotesModule, "useNote").mockImplementation(
      () => ({ data: note, isLoading: false }) as never,
    );
    vi.spyOn(useNotesModule, "useNoteTags").mockReturnValue({ data: TAGS } as never);
    vi.spyOn(useNotesModule, "useCreateNote").mockImplementation(
      () => ({ mutateAsync: createMutateAsync, isPending: false }) as never,
    );
    vi.spyOn(useNotesModule, "useUpdateNote").mockImplementation(
      () => ({ mutateAsync: updateMutateAsync, isPending: updatePending }) as never,
    );
    // The component reads `show` through the zustand selector, so spying on the
    // state object before render is enough to capture every alert.
    show = vi.spyOn(alertStore.getState(), "show").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves an existing note whose tags arrive with string ids", async () => {
    const user = userEvent.setup();
    render(<NoteEditorPage id={42} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMutateAsync.mock.calls[0][0].body).toMatchObject({
      title: "My note",
      tagIds: ["7"],
    });
  });

  it("creates a new note after selecting a tag chip with a string id", async () => {
    const user = userEvent.setup();
    note = undefined;
    render(<NoteEditorPage onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(/^notes\.field\.title/), "Fresh");
    await user.click(screen.getByRole("button", { name: "#b" }));
    await user.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ title: "Fresh", tagIds: ["8"] });
  });

  it("derives the title from the first body line when the title is blank", async () => {
    const user = userEvent.setup();
    note = undefined;
    render(<NoteEditorPage onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText("notes.field.body"), "Groceries{enter}milk");
    await user.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync.mock.calls[0][0]).toMatchObject({ title: "Groceries" });
  });

  it("shows an error alert instead of failing silently when validation fails", async () => {
    const user = userEvent.setup();
    note = existingNote({ title: "x".repeat(300) });
    render(<NoteEditorPage id={42} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() =>
      expect(show).toHaveBeenCalledWith(expect.objectContaining({ type: "error" })),
    );
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("does not report a title-required error while a save is still pending", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockReturnValue(new Promise(() => {}));
    const { rerender, container } = render(<NoteEditorPage id={42} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));

    // The mutation is now in flight. The Save button is disabled, so submit the
    // form directly, as a second submit (Enter in a field, a racing click) would.
    updatePending = true;
    rerender(<NoteEditorPage id={42} onSaved={vi.fn()} />);
    fireEvent.submit(container.querySelector("form")!);

    // Give the async submit handler time to settle before asserting the negative.
    await new Promise((r) => setTimeout(r, 50));
    expect(show).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "notes.titleRequired" }),
    );
    expect(updateMutateAsync).toHaveBeenCalledTimes(1);
  });
});
