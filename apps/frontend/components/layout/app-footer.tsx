import { cn } from "@/lib/utils";

export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "wh-app-footer flex h-9 w-full items-center justify-center px-2 text-center text-xs text-slate-500",
        className
      )}
    >
      All rights reserved automatons soft © 2026
    </footer>
  );
}
