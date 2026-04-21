import React, { Component, ComponentType, PropsWithChildren } from "react";
import { Sentry } from "@/config/sentry";
import { ErrorFallback, ErrorFallbackProps } from "@/components/ErrorFallback";

export type ErrorBoundaryProps = PropsWithChildren<{
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, stackTrace: string) => void;
}>;

type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static defaultProps = { FallbackComponent: ErrorFallback };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info.componentStack);
    } else {
      Sentry.captureException(error, {
        extra: { componentStack: info.componentStack },
      });
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render() {
    const { FallbackComponent } = this.props;
    return this.state.error && FallbackComponent ? (
      <FallbackComponent
        error={this.state.error}
        resetError={this.resetError}
      />
    ) : (
      this.props.children
    );
  }
}
