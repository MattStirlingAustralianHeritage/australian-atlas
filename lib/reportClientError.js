/**
 * Silently reports a client-side error to /api/client-error.
 * Fire-and-forget — never throws, never blocks.
 *
 * @param {Error|string} error
 * @param {Record<string, unknown>} context - extra fields merged into the payload
 */
export function reportClientError(error, context = {}) {
  try {
    const payload = {
      route: typeof window !== "undefined" ? window.location.pathname : "",
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : undefined,
      ...context,
    };

    if (typeof window !== "undefined" && typeof fetch === "function") {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Swallow — reporting should never cause secondary failures
      });
    }
  } catch {
    // Swallow completely
  }
}
