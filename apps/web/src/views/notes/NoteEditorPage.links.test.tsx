import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import NoteEditorPage from "./NoteEditorPage";
import * as useNotesModule from "@/hooks/useNotes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/common/PageBreadcrumb", () => ({ default: () => <div /> }));
vi.mock("./NoteLinksPanel", () => ({
  default: ({ noteId }: { noteId: string }) => <div data-testid="links-panel">{noteId}</div>,
}));
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  };
});

describe("NoteEditorPage note links", () => {
  beforeEach(() => {
    vi.spyOn(useNotesModule, "useNote").mockReturnValue({
      data: {
        id: 42,
        title: "My note",
        bodyMarkdown: "",
        pinned: false,
        archived: false,
        position: 0,
        colorHex: null,
        tags: [],
        createdAt: null,
        updatedAt: null,
      },
      isLoading: false,
    } as never);
    vi.spyOn(useNotesModule, "useNoteTags").mockReturnValue({ data: [] } as never);
    vi.spyOn(useNotesModule, "useCreateNote").mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    vi.spyOn(useNotesModule, "useUpdateNote").mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the links panel for an existing note, keyed by its id as a string", () => {
    render(<NoteEditorPage id={42} />);
    expect(screen.getByTestId("links-panel")).toHaveTextContent("42");
  });

  it("does not show the links panel for a note that is not saved yet", () => {
    render(<NoteEditorPage />);
    expect(screen.queryByTestId("links-panel")).not.toBeInTheDocument();
  });
});
