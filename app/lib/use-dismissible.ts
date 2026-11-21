"use client";

import { type RefObject, useEffect, useEffectEvent } from "react";

/** Dismisses an open popover or dialog on outside pointerdown or Escape key. */
export function useDismissible(
  open: boolean,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onDismiss: (reason: "outside" | "escape") => void
) {
  const handlePointerDown = useEffectEvent((event: PointerEvent) => {
    const target = event.target as Node | null;
    if (!target) return;
    const isInside = refs.some((ref) => ref.current?.contains(target));
    if (!isInside) {
      onDismiss("outside");
    }
  });

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss("escape");
    }
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => handlePointerDown(event);
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
}
