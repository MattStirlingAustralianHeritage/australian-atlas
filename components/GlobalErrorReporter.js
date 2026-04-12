"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/reportClientError";

/**
 * Invisible client component that attaches global error listeners.
 *
 * Catches:
 *   - unhandled promise rejections (window 'unhandledrejection')
 *   - uncaught runtime errors (window 'error')
 *
 * Reports each to /api/client-error silently via reportClientError.
 * Renders nothing.
 */
export default function GlobalErrorReporter() {
  useEffect(() => {
    function onUnhandledRejection(event) {
      const reason = event.reason;
      reportClientError(
        reason instanceof Error ? reason : new Error(String(reason)),
        { type: "unhandledrejection" }
      );
    }

    function onError(event) {
      // event.error may be null for cross-origin script errors
      const error = event.error || new Error(event.message || "Unknown error");
      reportClientError(error, {
        type: "uncaught_error",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
