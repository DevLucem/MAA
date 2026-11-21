"use client";

import type React from "react";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  type Doc,
  isDocDescendant,
  type MoveDocTarget,
} from "../../lib/docs-utils";

interface UseSidebarDocDragOptions {
  docs: Doc[];
  rootDocs: Doc[];
  childrenByParent: Map<string, Doc[]>;
  navRef: RefObject<HTMLElement | null>;
  moveDoc: (docId: string, target: MoveDocTarget) => boolean;
  onExpandDoc: (docId: string) => void;
  announce: (message: string) => void;
}

/** Manages pointer drag-and-drop and keyboard reordering for Docs sidebar tree items. */
export function useSidebarDocDrag({
  docs,
  rootDocs,
  childrenByParent,
  navRef,
  moveDoc,
  onExpandDoc,
  announce,
}: UseSidebarDocDragOptions) {
  const handleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const suppressNextClickRef = useRef(false);
  const isKeyboardMovingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const dropTargetRef = useRef<MoveDocTarget | null>(null);

  const pendingDragRef = useRef<{
    docId: string;
    pointerId: number;
    startX: number;
    startY: number;
    captureEl: HTMLElement;
    fromHandle: boolean;
    started: boolean;
  } | null>(null);

  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<MoveDocTarget | null>(null);
  const [grabbedDocId, setGrabbedDocId] = useState<string | null>(null);

  const registerHandleRef = useCallback(
    (id: string, el: HTMLButtonElement | null) => {
      if (el) {
        handleRefs.current.set(id, el);
      } else {
        handleRefs.current.delete(id);
      }
    },
    []
  );

  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number, draggingId: string): MoveDocTarget | null => {
      const nav = navRef.current;
      if (!nav) return null;
      const navRect = nav.getBoundingClientRect();
      if (clientX < navRect.left - 24 || clientX > navRect.right + 24) {
        return null;
      }

      const rootTopEl = nav.querySelector<HTMLElement>("[data-docs-root-top]");
      if (rootTopEl) {
        const topRect = rootTopEl.getBoundingClientRect();
        if (clientY >= topRect.top - 4 && clientY <= topRect.bottom) {
          return { type: "root", position: "start" };
        }
      }

      const docEls = nav.querySelectorAll<HTMLElement>("[data-doc-drop-id]");
      for (const el of docEls) {
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          const candidateId = el.dataset.docDropId;
          if (!candidateId || isDocDescendant(docs, candidateId, draggingId)) {
            return null;
          }
          const relativeY = clientY - rect.top;
          if (relativeY < rect.height * 0.25) {
            return { type: "doc", targetId: candidateId, placement: "before" };
          }
          if (relativeY > rect.height * 0.75) {
            return { type: "doc", targetId: candidateId, placement: "after" };
          }
          return { type: "doc", targetId: candidateId, placement: "inside" };
        }
      }

      const rootBottomEl = nav.querySelector<HTMLElement>(
        "[data-docs-root-bottom]"
      );
      if (rootBottomEl) {
        const bottomRect = rootBottomEl.getBoundingClientRect();
        if (clientY >= bottomRect.top - 8) {
          return { type: "root", position: "end" };
        }
      }

      if (clientY > navRect.top && clientY <= navRect.bottom + 80) {
        return { type: "root", position: "end" };
      }

      return null;
    },
    [docs, navRef]
  );

  const cleanupDrag = useCallback(() => {
    const pending = pendingDragRef.current;
    if (pending) {
      try {
        if (pending.captureEl.hasPointerCapture(pending.pointerId)) {
          pending.captureEl.releasePointerCapture(pending.pointerId);
        }
      } catch {
        // Ignore release errors
      }
    }
    pendingDragRef.current = null;
    activePointerIdRef.current = null;
    dropTargetRef.current = null;
    setDraggedDocId(null);
    setDropTarget(null);
    document.documentElement.classList.remove("is-dragging-doc");
  }, []);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("is-dragging-doc");
    };
  }, []);

  const handleStartPointerDrag = useCallback(
    (
      docId: string,
      event: React.PointerEvent<HTMLElement>,
      fromHandle: boolean
    ) => {
      if (event.button !== 0) return;
      if (activePointerIdRef.current !== null) return;
      if (!fromHandle && (event.target as HTMLElement).closest("button")) {
        return;
      }

      activePointerIdRef.current = event.pointerId;
      pendingDragRef.current = {
        docId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        captureEl: event.currentTarget,
        fromHandle,
        started: false,
      };
    },
    []
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;

      const dist = Math.hypot(
        event.clientX - pending.startX,
        event.clientY - pending.startY
      );
      const threshold = pending.fromHandle ? 3 : 5;

      if (!pending.started) {
        if (dist < threshold) return;
        pending.started = true;
        suppressNextClickRef.current = true;
        setGrabbedDocId(null);
        setDraggedDocId(pending.docId);
        document.documentElement.classList.add("is-dragging-doc");
        try {
          pending.captureEl.setPointerCapture(pending.pointerId);
        } catch {
          // Ignore capture errors
        }
      }

      const nextTarget = resolveDropTarget(
        event.clientX,
        event.clientY,
        pending.docId
      );
      dropTargetRef.current = nextTarget;
      setDropTarget(nextTarget);
    };

    const onPointerUp = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;

      if (pending.started) {
        const finalTarget = dropTargetRef.current;
        if (finalTarget) {
          const moved = moveDoc(pending.docId, finalTarget);
          if (moved) {
            if (
              finalTarget.type === "doc" &&
              finalTarget.placement === "inside"
            ) {
              onExpandDoc(finalTarget.targetId);
            }
            const docTitle =
              docs.find((d) => d.id === pending.docId)?.title.trim() ||
              "Untitled";
            announce(
              finalTarget.type === "root"
                ? `Moved ${docTitle} to Docs root`
                : finalTarget.placement === "inside"
                  ? `Nested ${docTitle}`
                  : `Reordered ${docTitle}`
            );
          }
        }
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }

      cleanupDrag();
    };

    const onPointerCancel = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      if (pending.started) {
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }
      cleanupDrag();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const pending = pendingDragRef.current;
      if (!pending || !pending.started || event.key !== "Escape") return;
      event.preventDefault();
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
      cleanupDrag();
      announce("Move cancelled");
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [announce, cleanupDrag, docs, moveDoc, onExpandDoc, resolveDropTarget]);

  const refocusHandle = useCallback((docId: string) => {
    isKeyboardMovingRef.current = true;
    requestAnimationFrame(() => {
      handleRefs.current.get(docId)?.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        isKeyboardMovingRef.current = false;
      });
    });
  }, []);

  const handleKeyboardReorder = useCallback(
    (doc: Doc, event: React.KeyboardEvent<HTMLButtonElement>) => {
      const title = doc.title.trim() || "Untitled";
      const isGrabbed = grabbedDocId === doc.id;

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (isGrabbed) {
          setGrabbedDocId(null);
          announce(`Dropped ${title}`);
        } else {
          setGrabbedDocId(doc.id);
          announce(
            `Picked up ${title}. Use Up or Down to reorder, Right to nest, Left to move out, Space to drop, Escape to cancel.`
          );
        }
        return;
      }

      if (!isGrabbed) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setGrabbedDocId(null);
        announce("Move cancelled");
        return;
      }

      const siblings = doc.parentId
        ? childrenByParent.get(doc.parentId) ?? []
        : rootDocs;
      const idx = siblings.findIndex((item) => item.id === doc.id);

      if (event.key === "ArrowUp" && idx > 0) {
        event.preventDefault();
        const moved = moveDoc(doc.id, {
          type: "doc",
          targetId: siblings[idx - 1].id,
          placement: "before",
        });
        if (moved) {
          refocusHandle(doc.id);
          announce(`Moved ${title} up`);
        }
      } else if (
        event.key === "ArrowDown" &&
        idx !== -1 &&
        idx < siblings.length - 1
      ) {
        event.preventDefault();
        const moved = moveDoc(doc.id, {
          type: "doc",
          targetId: siblings[idx + 1].id,
          placement: "after",
        });
        if (moved) {
          refocusHandle(doc.id);
          announce(`Moved ${title} down`);
        }
      } else if (event.key === "ArrowRight" && idx > 0) {
        event.preventDefault();
        const targetParent = siblings[idx - 1];
        const moved = moveDoc(doc.id, {
          type: "doc",
          targetId: targetParent.id,
          placement: "inside",
        });
        if (moved) {
          onExpandDoc(targetParent.id);
          refocusHandle(doc.id);
          announce(
            `Nested ${title} inside ${targetParent.title.trim() || "Untitled"}`
          );
        }
      } else if (event.key === "ArrowLeft" && doc.parentId) {
        event.preventDefault();
        const parentDoc = docs.find((item) => item.id === doc.parentId);
        const moved = moveDoc(
          doc.id,
          parentDoc
            ? { type: "doc", targetId: parentDoc.id, placement: "after" }
            : { type: "root", position: "end" }
        );
        if (moved) {
          refocusHandle(doc.id);
          announce(`Moved ${title} out`);
        }
      }
    },
    [
      announce,
      childrenByParent,
      docs,
      grabbedDocId,
      moveDoc,
      onExpandDoc,
      refocusHandle,
      rootDocs,
    ]
  );

  const handleHandleBlur = useCallback((docId: string) => {
    if (isKeyboardMovingRef.current) return;
    setGrabbedDocId((curr) => (curr === docId ? null : curr));
  }, []);

  const handleNavClickCapture = useCallback<
    React.MouseEventHandler<HTMLElement>
  >((event) => {
    if (suppressNextClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressNextClickRef.current = false;
    }
  }, []);

  return {
    draggedDocId,
    dropTarget,
    grabbedDocId,
    registerHandleRef,
    handleStartPointerDrag,
    handleKeyboardReorder,
    handleHandleBlur,
    handleNavClickCapture,
  };
}
