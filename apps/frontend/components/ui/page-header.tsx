import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHeader(props: { title: string; subtitle?: string; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("wh-page-header flex flex-col gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-5 text-[#0F172A] md:flex-row md:items-start md:justify-between", props.className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="wh-page-header__title truncate text-2xl font-semibold tracking-tight">{props.title}</h1>
        {props.subtitle ? <p className="wh-page-header__subtitle text-sm text-[#64748B]">{props.subtitle}</p> : null}
      </div>
      {props.actions ? <div className="flex flex-wrap items-center gap-2">{props.actions}</div> : null}
    </header>
  );
}
