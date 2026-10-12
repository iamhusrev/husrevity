import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError } from "axios";
import React from "react";
import NoteLinksPanel from "./NoteLinksPanel";
import * as useNoteLinksModule from "@/hooks/useNoteLinks";
import * as useGoalsModule from "@/hooks/useGoals";
import * as useProjectsModule from "@/hooks/useProjects";
import { NoteLinkResponse } from "@/types/note-link/note-link";

const showUndoToast = vi.fn();
vi.mock("@/stores/alert-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stores/alert-store")>();
  return { ...actual, showUndoToast: (...args: unknown[]) => showUndoToast(...args) };
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) =>
        opts ? `${key}${JSON.stringify(opts)}` : key,
      i18n: { language: "en" },
    }),
  };
});

function link(overrides: Partial<NoteLinkResponse> & { id: string }): NoteLinkResponse {
  return {
    noteId: "5",
    targetType: "goal",
    targetId: "1",
    targetTitle: "Ship v2",
    createdAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("NoteLinksPanel", () => {
  const addMutate = vi.fn();
  const removeMutate = vi.fn();
  let links: NoteLinkResponse[] | undefined;
  let linkState: { isLoading?: boolean; isError?: boolean };
  let removePending = false;
  let addPending = false;

  beforeEach(() => {
    vi.clearAllMocks();
    links = [];
    linkState = {};
    removePending = false;
    addPending = false;
    vi.spyOn(useNoteLinksModule, "useNoteLinks").mockImplementation(
      () => ({ data: links, refetch: vi.fn(), ...linkState }) as never,
    );
    vi.spyOn(useNoteLinksModule, "useAddNoteLink").mockImplementation(
      () => ({ mutate: addMutate, isPending: addPending }) as never,
    );
    vi.spyOn(useNoteLinksModule, "useRemoveNoteLink").mockImplementation(
      () => ({ mutate: removeMutate, isPending: removePending }) as never,
    );
    vi.spyOn(useGoalsModule, "useGoals").mockReturnValue({
      data: [
        { id: "1", title: "Ship v2", horizon: "quarter" },
        { id: "2", title: "Read more", horizon: "month" },
      ],
    } as never);
    vi.spyOn(useProjectsModule, "useProjects").mockReturnValue({
      data: [
        { id: 11, name: "Alpha", archived: false },
        { id: 12, name: "Old", archived: true },
      ],
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists links with a type label and the target title", () => {
    links = [
      link({ id: "a", targetType: "goal", targetTitle: "Ship v2" }),
      link({ id: "b", targetType: "project", targetId: "11", targetTitle: "Alpha" }),
      link({ id: "c", targetType: "item", targetId: "99", targetTitle: "Call bank" }),
    ];
    render(<NoteLinksPanel noteId="5" />);
    const rowA = screen.getByTestId("note-link-a");
    expect(rowA).toHaveTextContent("noteLinks.type.goal");
    expect(rowA).toHaveTextContent("Ship v2");
    expect(screen.getByTestId("note-link-b")).toHaveTextContent("noteLinks.type.project");
    expect(screen.getByTestId("note-link-c")).toHaveTextContent("noteLinks.type.item");
  });

  it("renders a dangling target and still lets the user remove it", async () => {
    links = [link({ id: "d", targetType: "item", targetId: "404", targetTitle: null })];
    const user = userEvent.setup();
    render(<NoteLinksPanel noteId="5" />);
    const row = screen.getByTestId("note-link-d");
    expect(row).toHaveTextContent("noteLinks.dangling");
    await user.click(within(row).getByRole("button", { name: /noteLinks\.remove/ }));
    expect(removeMutate).toHaveBeenCalledWith("d", expect.anything());
  });

  it("removes without confirmation and offers an undo that re-adds the link", async () => {
    links = [link({ id: "a", targetType: "goal", targetId: "1" })];
    removeMutate.mockImplementation((_id: string, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    const confirmSpy = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    render(<NoteLinksPanel noteId="5" />);
    await user.click(
      within(screen.getByTestId("note-link-a")).getByRole("button", { name: /noteLinks\.remove/ }),
    );
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(showUndoToast).toHaveBeenCalledTimes(1);
    (showUndoToast.mock.calls[0][0] as { onUndo: () => void }).onUndo();
    expect(addMutate).toHaveBeenCalledWith({ targetType: "goal", targetId: "1" });
  });

  it("ignores remove while a removal is pending", () => {
    links = [link({ id: "a" })];
    removePending = true;
    render(<NoteLinksPanel noteId="5" />);
    expect(
      within(screen.getByTestId("note-link-a")).getByRole("button", { name: /noteLinks\.remove/ }),
    ).toBeDisabled();
  });

  it("shows loading, error with retry and the empty state", () => {
    linkState = { isLoading: true };
    links = undefined;
    const first = render(<NoteLinksPanel noteId="5" />);
    expect(screen.getByTestId("note-links-loading")).toBeInTheDocument();
    first.unmount();

    linkState = { isError: true };
    const second = render(<NoteLinksPanel noteId="5" />);
    expect(screen.getByRole("alert")).toHaveTextContent("noteLinks.error");
    second.unmount();

    linkState = {};
    links = [];
    render(<NoteLinksPanel noteId="5" />);
    expect(screen.getByText("noteLinks.empty")).toBeInTheDocument();
  });

  it("states that linking to a single item is done through Claude", () => {
    render(<NoteLinksPanel noteId="5" />);
    expect(screen.getByText("noteLinks.itemHelper")).toBeInTheDocument();
  });

  describe("add dialog", () => {
    async function openDialog(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: "noteLinks.add" }));
      return screen.getByRole("dialog");
    }

    it("renders outside the panel so a transformed note modal cannot clip it", async () => {
      const user = userEvent.setup();
      const { container } = render(<NoteLinksPanel noteId="5" />);
      const dialog = await openDialog(user);
      expect(container.contains(dialog)).toBe(false);
      expect(document.body.contains(dialog)).toBe(true);
    });

    it("offers only goals and projects and lists non-archived projects", async () => {
      const user = userEvent.setup();
      render(<NoteLinksPanel noteId="5" />);
      const dialog = await openDialog(user);
      const type = within(dialog).getByLabelText("noteLinks.dialog.type");
      expect(
        within(type)
          .getAllByRole("option")
          .map((o) => o.getAttribute("value")),
      ).toEqual(["goal", "project"]);
      await user.selectOptions(type, "project");
      const target = within(dialog).getByLabelText("noteLinks.dialog.target");
      expect(
        within(target)
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual(["noteLinks.dialog.placeholder", "Alpha"]);
    });

    it("adds a goal link with string ids", async () => {
      const user = userEvent.setup();
      render(<NoteLinksPanel noteId="5" />);
      const dialog = await openDialog(user);
      await user.selectOptions(within(dialog).getByLabelText("noteLinks.dialog.target"), "2");
      await user.click(within(dialog).getByRole("button", { name: "noteLinks.dialog.submit" }));
      expect(addMutate).toHaveBeenCalledWith(
        { targetType: "goal", targetId: "2" },
        expect.anything(),
      );
    });

    it("does not submit without a target", async () => {
      const user = userEvent.setup();
      render(<NoteLinksPanel noteId="5" />);
      const dialog = await openDialog(user);
      expect(
        within(dialog).getByRole("button", { name: "noteLinks.dialog.submit" }),
      ).toBeDisabled();
    });

    it("shows the 50-link cap message from the API as is, inline", async () => {
      const capError = new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
        statusText: "Bad Request",
        headers: {},
        config: {} as never,
        data: { message: "A note can have at most 50 links" },
      });
      addMutate.mockImplementation((_b: unknown, opts?: { onError?: (e: unknown) => void }) =>
        opts?.onError?.(capError),
      );
      const user = userEvent.setup();
      render(<NoteLinksPanel noteId="5" />);
      const dialog = await openDialog(user);
      await user.selectOptions(within(dialog).getByLabelText("noteLinks.dialog.target"), "1");
      await user.click(within(dialog).getByRole("button", { name: "noteLinks.dialog.submit" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "A note can have at most 50 links",
      );
      // The dialog stays open so the user can read it.
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("closes with Escape and returns focus to the add button", async () => {
      const user = userEvent.setup();
      render(<NoteLinksPanel noteId="5" />);
      const trigger = screen.getByRole("button", { name: "noteLinks.add" });
      await user.click(trigger);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("closes after a successful add", async () => {
      addMutate.mockImplementation((_b: unknown, opts?: { onSuccess?: () => void }) =>
        opts?.onSuccess?.(),
      );
      const user = userEvent.setup();
      render(<NoteLinksPanel noteId="5" />);
      const dialog = await openDialog(user);
      await user.selectOptions(within(dialog).getByLabelText("noteLinks.dialog.target"), "1");
      await user.click(within(dialog).getByRole("button", { name: "noteLinks.dialog.submit" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
