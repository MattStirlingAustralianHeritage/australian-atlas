"use client";

import React from "react";
import { reportClientError } from "@/lib/reportClientError";

/**
 * Client-side error boundary.
 *
 * Catches render errors in its subtree, reports them silently to
 * /api/client-error, and shows a recoverable fallback UI.
 *
 * Props:
 *   - children: React children to wrap
 *   - fallback: optional custom fallback UI (ReactNode or render function receiving { error, reset })
 */
export default class ClientErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    reportClientError(error, {
      componentStack: errorInfo?.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // Support custom fallback — either a ReactNode or a render function
      if (typeof this.props.fallback === "function") {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        });
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div style={styles.container}>
          <h2 style={styles.heading}>Something went wrong</h2>
          <p style={styles.message}>
            An unexpected error occurred. You can try again or refresh the page.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={styles.button}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem 1.5rem",
    textAlign: "center",
    fontFamily: "var(--font-body)",
    color: "var(--color-ink)",
  },
  heading: {
    fontFamily: "var(--font-display)",
    fontSize: "1.5rem",
    fontWeight: 700,
    marginBottom: "0.5rem",
    color: "var(--color-ink)",
  },
  message: {
    fontSize: "0.95rem",
    color: "var(--color-muted)",
    marginBottom: "1.5rem",
    maxWidth: "28rem",
    lineHeight: 1.5,
  },
  button: {
    fontFamily: "var(--font-body)",
    fontSize: "0.875rem",
    fontWeight: 500,
    padding: "0.5rem 1.25rem",
    borderRadius: "0.375rem",
    border: "1px solid var(--color-ink)",
    background: "transparent",
    color: "var(--color-ink)",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  },
};
