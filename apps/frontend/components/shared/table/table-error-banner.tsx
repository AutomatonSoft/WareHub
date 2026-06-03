"use client";

import { ErrorState } from "../error-state";

type TableErrorBannerProps = {
  message: string;
  onRetry?: () => void;
};

export function TableErrorBanner({ message, onRetry }: TableErrorBannerProps) {
  return (
    <div className="p-3">
      <ErrorState message={message} onRetry={onRetry} compact />
    </div>
  );
}
