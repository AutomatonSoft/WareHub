import { cn } from "@/lib/utils";

const COPYRIGHT_START_YEAR = 2026;

function getCopyrightYears() {
  const currentYear = new Date().getFullYear();
  return currentYear <= COPYRIGHT_START_YEAR
    ? String(COPYRIGHT_START_YEAR)
    : `${COPYRIGHT_START_YEAR} - ${currentYear}`;
}

export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "wh-app-footer flex h-9 w-full items-center justify-center px-2 text-center text-xs text-slate-500",
        className
      )}
    >
      {`All rights reserved automatons soft © ${getCopyrightYears()}`}
    </footer>
  );
}
