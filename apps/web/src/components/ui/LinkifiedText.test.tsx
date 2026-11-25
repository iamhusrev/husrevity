import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LinkifiedText from "./LinkifiedText";

describe("LinkifiedText", () => {
  it("renders URLs as new-tab links and keeps the rest as text", () => {
    const { container } = render(
      <p>
        <LinkifiedText text="Kaynak: https://pgexercises.com bugün" />
      </p>,
    );
    const link = screen.getByRole("link", { name: "https://pgexercises.com" });
    expect(link).toHaveAttribute("href", "https://pgexercises.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(container.textContent).toBe("Kaynak: https://pgexercises.com bugün");
  });

  it("renders plain text without any link", () => {
    render(<LinkifiedText text="Aile ve dinlenme" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Aile ve dinlenme")).toBeInTheDocument();
  });

  it("does not let a link click reach the parent card", () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick}>
        <LinkifiedText text="https://a.com" />
      </div>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
