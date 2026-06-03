"use client";

import { Skeleton } from "../skeleton";

type MobileListSkeletonCardProps = {
  index: number;
  withThumb?: boolean;
};

export function MobileListSkeletonCard({ index, withThumb = true }: MobileListSkeletonCardProps) {
  return (
    <div className="ui-skeleton-shell p-3">
      {withThumb ? (
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 rounded-xl" delayMs={index * 50} />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-28" delayMs={index * 50 + 20} />
            <Skeleton className="h-4 w-40" delayMs={index * 50 + 40} />
          </div>
        </div>
      ) : (
        <>
          <Skeleton className="h-4 w-24" delayMs={index * 50} />
          <Skeleton className="mt-2 h-[110px] w-full rounded-xl" delayMs={index * 50 + 20} />
          <Skeleton className="mt-2 h-4 w-40" delayMs={index * 50 + 40} />
        </>
      )}
    </div>
  );
}

