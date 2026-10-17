"use client";

import { useEffect } from "react";

/** Counts this visit once per tab (Settings · Plan, "Visits this month"). Nothing is stored about the visitor. */
export function VisitBeacon() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("oi_v")) return;
      sessionStorage.setItem("oi_v", "1");
    } catch {
      // Storage blocked: still count it, once for this page.
    }
    if (!navigator.sendBeacon?.("/api/visit")) void fetch("/api/visit", { method: "POST", keepalive: true }).catch(() => {});
  }, []);
  return null;
}
