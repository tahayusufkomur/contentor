"use client";

import type { ComponentProps } from "react";
import { ThemeToggle as SharedThemeToggle } from "@shared/ui/theme-toggle";

// The marketing app exposes three brightness levels: the stark `light`, the
// near-black `dark`, and a comfortable `dim` middle. Callers keep using the
// same <ThemeToggle /> — the modes are injected here so every mount (sidebar,
// header) cycles through all three.
const MODES = ["light", "dim", "dark"];

export function ThemeToggle(
  props: Omit<ComponentProps<typeof SharedThemeToggle>, "modes">,
) {
  return <SharedThemeToggle {...props} modes={MODES} />;
}
