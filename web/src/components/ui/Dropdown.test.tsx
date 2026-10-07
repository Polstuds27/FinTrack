import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dropdown } from "./Controls";

function open(): void {
  fireEvent.click(screen.getByRole("button", { name: "Row actions" }));
}

describe("Dropdown", () => {
  it("opens a fixed-position menu that escapes clipped ancestors", () => {
    const onSelect = vi.fn();
    render(
      <Dropdown
        label="Row actions"
        trigger={<span>···</span>}
        items={[{ id: "edit", label: "Edit", onSelect }]}
      />,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    open();
    const menu = screen.getByRole("menu");
    // `absolute` inside an `overflow-hidden` card is what clipped the menu
    // invisibly on the Accounts page — fixed positioning escapes it.
    expect(menu.classList.contains("fixed")).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and outside pointer-down", () => {
    render(
      <Dropdown
        label="Row actions"
        trigger={<span>···</span>}
        items={[{ id: "edit", label: "Edit", onSelect: () => {} }]}
      />,
    );
    open();
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
