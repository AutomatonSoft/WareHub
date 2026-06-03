import { Skeleton } from "@/components/ui/skeleton";

export function SofortListLoadingState() {
  const rows = Array.from({ length: 6 });

  return (
    <div className="wh-sofort-loading-table" aria-hidden="true">
      <div className="wh-sofort-loading-table__head">
        <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--checkbox">
          <Skeleton className="h-4 w-4 rounded-full" />
        </div>
        <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--image">
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--product">
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--attributes">
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--price">
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--ean">
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--marketplace">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--actions">
          <Skeleton className="h-3 w-14" />
        </div>
      </div>

      <div className="wh-sofort-loading-table__body">
        {rows.map((_, index) => (
          <div key={`sofort-loading-${index}`} className="wh-sofort-loading-table__row">
            <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--checkbox">
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--image">
              <Skeleton className="h-[78px] w-[78px] rounded-xl" />
            </div>
            <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--product">
              <Skeleton className="mb-2 h-4 w-28" />
              <Skeleton className="mb-1.5 h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--attributes">
              <Skeleton className="mb-1.5 h-3 w-24" />
              <Skeleton className="mb-1.5 h-3 w-20" />
              <Skeleton className="mb-1.5 h-3 w-[88px]" />
              <Skeleton className="mb-1.5 h-3 w-[72px]" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--price">
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--ean">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--marketplace">
              <Skeleton className="mb-1.5 h-3 w-44" />
              <Skeleton className="mb-1.5 h-3 w-44" />
              <Skeleton className="mb-1.5 h-3 w-44" />
              <Skeleton className="mb-1.5 h-3 w-44" />
              <Skeleton className="h-3 w-44" />
            </div>
            <div className="wh-sofort-loading-table__cell wh-sofort-loading-table__cell--actions">
              <div className="flex items-center justify-center gap-2">
                <Skeleton className="h-8 w-16 rounded-xl" />
                <Skeleton className="h-8 w-16 rounded-xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
