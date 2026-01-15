import { Plus } from "lucide-svelte";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import Button from "./Button.svelte";

describe("Button", () => {
  it("should render button element", async () => {
    render(Button);

    const button = page.getByRole("button");
    await expect.element(button).toBeInTheDocument();
  });

  it("should render button element as hidden and disabled when hidden is true", async () => {
    render(Button, { hidden: true });

    const button = page.getByRole("button", { includeHidden: true });
    await expect.element(button).toBeInTheDocument();
    await expect.element(button).toHaveClass("hidden");
    await expect.element(button).toBeDisabled();
    await expect.element(button).toHaveAttribute("aria-hidden", "true");
  });

  it("should render icon when icon is provided", async () => {
    render(Button, { icon: Plus, hidden: false });

    const button = page.getByRole("button");
    await expect.element(button).toBeInTheDocument();
    await expect.element(button).toContainElement(page.getByClassName("lucide-plus"));
  });

  it("should not render icon when icon is undefined", async () => {
    render(Button, { icon: undefined });

    const button = page.getByRole("button");
    await expect.element(button).toBeInTheDocument();
    await expect.element(page.getByClassName("lucide-icon")).not.toBeInTheDocument();
  });

  it("should not render icon when hidden is true", async () => {
    render(Button, { icon: Plus, hidden: true });

    const button = page.getByRole("button", { includeHidden: true });
    await expect.element(button).toBeInTheDocument();
    await expect.element(page.getByClassName("lucide-plus")).not.toBeInTheDocument();
  });

  it("should bind button to an existing element", async () => {
    const buttonElement = document.createElement("button");
    document.body.appendChild(buttonElement);
    render(Button, { element: buttonElement });

    await expect.element(buttonElement).toBeInTheDocument();
  });
});
