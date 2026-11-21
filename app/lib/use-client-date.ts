"use client";

import { useSyncExternalStore } from "react";
import { formatPlainDate, todayPlainDate } from "./database-types";

const emptySubscribe = () => () => {};
const getServerSnapshot = () => null;
const getClientTodayIso = () => formatPlainDate(todayPlainDate());

/** Returns today's local YYYY-MM-DD string on the client and null during SSR. */
export function useTodayIsoDate(): string | null {
  return useSyncExternalStore(
    emptySubscribe,
    getClientTodayIso,
    getServerSnapshot
  );
}
