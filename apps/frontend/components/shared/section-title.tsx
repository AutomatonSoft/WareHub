import React from "react";

export function SectionTitle({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ui-desktop-rhythm-section mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="page-title ui-title-2 text-[color:var(--text-primary)]">{title}</h2>
        {subtitle ? <p className="mt-1 ui-caption">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
