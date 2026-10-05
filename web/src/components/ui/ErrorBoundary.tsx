/**
 * Keeps one broken screen from blanking the whole app.
 *
 * React unmounts the entire tree when a component throws during render, and
 * with no boundary the user is left staring at a white page. Catching the error
 * here turns that into the shared error state with a way back.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./Feedback";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown above the default explanation. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the console: the UI already tells the user what to do.
    console.error("FinTrack: screen failed to render", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
        <ErrorState
          kind="unknown"
          title={this.props.title ?? "This screen stopped responding"}
          description="Something on the page failed to load. Your data is stored on this device, so reloading is safe."
          onRetry={() => window.location.reload()}
          retryLabel="Reload"
        />
      </div>
    );
  }
}
