import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({ title = "Loading", className }: { title?: string; className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-xl border bg-card p-4", className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <p className="text-xs text-muted-foreground">{title}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}


