"use client";

import { useId } from "react";
import type { ReactNode } from "react";

type FormFieldRenderProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "data-state"?: "error" | "success";
  disabled?: boolean;
};

type FormFieldProps = {
  label?: string;
  required?: boolean;
  description?: string;
  error?: string | null;
  success?: string | null;
  disabled?: boolean;
  id?: string;
  className?: string;
  children: (props: FormFieldRenderProps) => ReactNode;
};

export function FormField({
  label,
  required = false,
  description,
  error,
  success,
  disabled = false,
  id,
  className,
  children
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId}`;
  const hasError = Boolean(error && error.trim().length > 0);
  const hasSuccess = Boolean(success && success.trim().length > 0);
  const descriptionId = description ? `${controlId}-description` : undefined;
  const errorId = hasError ? `${controlId}-error` : undefined;
  const successId = hasSuccess ? `${controlId}-success` : undefined;
  const describedBy = [descriptionId, errorId, successId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className ?? "grid gap-1.5"}>
      {label ? (
        <label htmlFor={controlId} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </label>
      ) : null}
      {children({
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": hasError || undefined,
        "data-state": hasError ? "error" : hasSuccess ? "success" : undefined,
        disabled
      })}
      {description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {!hasError && hasSuccess ? (
        <p id={successId} className="text-xs text-chart-2">
          {success}
        </p>
      ) : null}
    </div>
  );
}
