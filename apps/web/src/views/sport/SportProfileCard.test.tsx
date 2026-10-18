import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import SportProfileCard from "./SportProfileCard";

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
      i18n: { language: "en" },
    }),
  };
});

const { profileResult, refetch } = vi.hoisted(() => ({
  refetch: vi.fn(),
  profileResult: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/hooks/useSport", () => ({
  useSportProfile: () => profileResult,
  useUpdateSportProfile: () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  refetch.mockReset();
  profileResult.refetch = refetch;
  profileResult.isError = false;
  profileResult.isLoading = false;
  profileResult.data = undefined;
});

afterEach(cleanup);

describe("SportProfileCard", () => {
  it("shows an inline error with Retry when the profile query fails", () => {
    profileResult.isError = true;
    render(<SportProfileCard />);

    expect(screen.getByText("Profile could not be loaded.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not render a blank card when there is no data and no error", () => {
    const { container } = render(<SportProfileCard />);

    expect(container.firstChild).not.toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders the profile when data is present", () => {
    profileResult.data = {
      id: "pr1",
      fitnessLevel: "beginner",
      weeklyHours: 4,
      preferredActivities: [],
      goals: null,
      notes: null,
      createdAt: "",
      updatedAt: "",
    };
    render(<SportProfileCard />);

    expect(screen.getByText("Spor profilim")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
