"use client";

import { cn } from "../lib/utils";
import { errorMessage } from "../hooks/async-runner";
import { Button } from "./button";

interface PageStateProps {
  loading: boolean;
  /** Any truthy value renders the error state (an Error yields its message). */
  error?: unknown;
  skeleton: React.ReactNode;
  onRetry?: () => void;
  className?: string;
  children: React.ReactNode;
}

export function PageState({
  loading,
  error,
  skeleton,
  onRetry,
  className,
  children,
}: PageStateProps) {
  if (loading) return <>{skeleton}</>;
  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <h3 className="text-lg font-semibold">Something went wrong</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {errorMessage(error, "Failed to load this page. Please try again.")}
        </p>
        {onRetry && (
          <Button className="mt-4" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className={cn("motion-safe:animate-fade-in-up", className)}>
      {children}
    </div>
  );
}
