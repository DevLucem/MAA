"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { AgentChatMessage } from "./hermes-client";

const BOTTOM_THRESHOLD_PX = 48;

interface UseChatAutoScrollOptions {
  sessionId: string;
  messages: AgentChatMessage[];
  isStreaming: boolean;
  openKey?: string;
}

/**
 * Scrolls a chat container to the bottom when opened or when switching sessions,
 * and sticks to the bottom as the agent streams responses only if the user hasn't
 * scrolled up to inspect earlier messages.
 */
export function useChatAutoScroll({
  sessionId,
  messages,
  isStreaming,
  openKey,
}: UseChatAutoScrollOptions) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    isPinnedToBottomRef.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
  }, []);

  // Always scroll to the bottom when the chat view opens or the active session changes.
  useLayoutEffect(() => {
    isPinnedToBottomRef.current = true;
    scrollToBottom();
    const rafId = requestAnimationFrame(() => {
      scrollToBottom();
    });
    return () => cancelAnimationFrame(rafId);
  }, [sessionId, openKey, scrollToBottom]);

  // Keep scrolling as new messages or streaming deltas arrive only if already at the bottom
  // (or when the user just sent a new message).
  useEffect(() => {
    const countIncreased = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (countIncreased) {
      const hasRecentUserMessage =
        messages[messages.length - 1]?.role === "user" ||
        messages[messages.length - 2]?.role === "user";
      if (hasRecentUserMessage && isStreaming) {
        isPinnedToBottomRef.current = true;
      }
    }

    if (isPinnedToBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, isStreaming, scrollToBottom]);

  return {
    scrollContainerRef,
    handleScroll,
    scrollToBottom,
  };
}
