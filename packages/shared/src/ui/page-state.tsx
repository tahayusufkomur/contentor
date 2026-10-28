"use client";

import { useTranslations } from "next-intl";
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

/** Its own component: the words are read only when something went wrong. */
function PageError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const t = useTranslations("common");
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <h3 className="text-lg font-semibold">{t("ui.somethingWrong")}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {errorMessage(error, t("ui.loadFailed"))}
      </p>
      {onRetry && (
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          {t("ui.tryAgain")}
        </Button>
      )}
    </div>
  );
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
  if (error) return <PageError error={error} onRetry={onRetry} />;
  return (
    <div className={cn("motion-safe:animate-fade-in-up", className)}>
      {children}
    </div>
  );
}
