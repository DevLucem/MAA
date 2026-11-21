"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function showAnchoredPopover(popover: HTMLElement, source: HTMLElement) {
  (
    popover as HTMLElement & {
      showPopover: (options?: { source?: HTMLElement }) => void;
    }
  ).showPopover({ source });
}

export function positionPopoverBelowEnd(trigger: HTMLElement, popover: HTMLElement) {
  const rect = trigger.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const width = popRect.width || popover.offsetWidth || 224;
  const height = popRect.height || popover.offsetHeight || 160;
  const top = Math.min(
    rect.bottom + 6,
    Math.max(8, window.innerHeight - height - 8)
  );
  const left = Math.max(
    8,
    Math.min(rect.right - width, window.innerWidth - width - 8)
  );
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

/**
 * Shared behaviour for toolbar `...` popover menus: invoker and anchor-positioning
 * fallbacks, focusgroup/arrow-key navigation, and focus restoration.
 * Re-binds whenever `resetKey` changes (e.g. the active item id).
 */
export function useToolbarMenu(resetKey: string) {
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPopoverRef = useRef<HTMLDivElement>(null);
  const menuGroupRef = useRef<HTMLDivElement>(null);
  const enterOnOpenRef = useRef(false);
  const pointerDownTriggerRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Invoker, focusgroup, keyboard, and anchor-positioning fallbacks for `...` menu
  useEffect(() => {
    const trigger = menuTriggerRef.current;
    const popover = menuPopoverRef.current;
    const group = menuGroupRef.current;
    if (!trigger || !popover || !group) return;

    const supportsInvokers = "commandForElement" in HTMLButtonElement.prototype;
    const supportsFocusGroup = "focusGroup" in HTMLElement.prototype;
    const supportsAnchor =
      CSS.supports("position-area: block-end") &&
      CSS.supports("anchor-name: --anchor");

    if (!supportsFocusGroup) {
      group.setAttribute("role", "menu");
      group.querySelectorAll("button").forEach((btn) => {
        btn.setAttribute("role", "menuitem");
      });
    }

    const getMenuItems = () =>
      Array.from(group.querySelectorAll<HTMLButtonElement>("button")).filter(
        (item) =>
          !item.disabled && item.getAttribute("aria-disabled") !== "true"
      );

    const closeAndRestore = (fromPointer: boolean) => {
      if (fromPointer) {
        trigger.focus({ focusVisible: false } as FocusOptions);
      } else {
        trigger.focus();
      }
      if (popover.matches(":popover-open")) {
        popover.hidePopover();
      }
    };

    const onTriggerPointerDown = () => {
      pointerDownTriggerRef.current = true;
    };

    const onTriggerClick = (event: MouseEvent) => {
      const fromKeyboard = event.detail === 0 && !pointerDownTriggerRef.current;
      pointerDownTriggerRef.current = false;
      if (fromKeyboard && !popover.matches(":popover-open")) {
        enterOnOpenRef.current = true;
      }

      if (supportsInvokers) return;
      event.preventDefault();
      if (popover.matches(":popover-open")) {
        closeAndRestore(!fromKeyboard);
      } else {
        showAnchoredPopover(popover, trigger);
      }
    };

    const onTriggerKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      enterOnOpenRef.current = true;
      if (popover.matches(":popover-open")) {
        getMenuItems()[0]?.focus({ preventScroll: true });
        enterOnOpenRef.current = false;
      } else {
        trigger.click();
      }
    };

    const onToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      const isOpen = toggleEvent.newState === "open";
      setMenuOpen(isOpen);

      if (isOpen) {
        if (!supportsAnchor) {
          positionPopoverBelowEnd(trigger, popover);
        }
        if (enterOnOpenRef.current) {
          enterOnOpenRef.current = false;
          requestAnimationFrame(() => {
            getMenuItems()[0]?.focus({ preventScroll: true });
          });
        }
      } else {
        enterOnOpenRef.current = false;
      }
    };

    const onPopoverKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestore(false);
        return;
      }

      if (event.key === "Tab") {
        popover.hidePopover();
        return;
      }

      if (
        !supportsFocusGroup &&
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
      ) {
        const items = getMenuItems();
        if (items.length === 0) return;
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (current + (event.key === "ArrowUp" ? -1 : 1) + items.length) %
                items.length;
        event.preventDefault();
        items[next]?.focus({ preventScroll: true });
      }
    };

    const onItemPointerMove = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest("button");
      if (!target || !group.contains(target)) return;
      if (document.activeElement !== target) {
        target.focus({ focusVisible: false } as FocusOptions);
      }
    };

    trigger.addEventListener("pointerdown", onTriggerPointerDown);
    trigger.addEventListener("click", onTriggerClick);
    trigger.addEventListener("keydown", onTriggerKeyDown);
    popover.addEventListener("toggle", onToggle);
    popover.addEventListener("keydown", onPopoverKeyDown);
    group.addEventListener("pointermove", onItemPointerMove);

    return () => {
      trigger.removeEventListener("pointerdown", onTriggerPointerDown);
      trigger.removeEventListener("click", onTriggerClick);
      trigger.removeEventListener("keydown", onTriggerKeyDown);
      popover.removeEventListener("toggle", onToggle);
      popover.removeEventListener("keydown", onPopoverKeyDown);
      group.removeEventListener("pointermove", onItemPointerMove);
    };
  }, [resetKey]);

  const closeMenu = useCallback(() => {
    if (menuPopoverRef.current?.matches(":popover-open")) {
      menuPopoverRef.current.hidePopover();
    }
  }, []);

  return { menuTriggerRef, menuPopoverRef, menuGroupRef, menuOpen, closeMenu };
}
