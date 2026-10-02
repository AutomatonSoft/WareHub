"use client";

import { startTransition, useEffect, useRef, type ComponentProps } from "react";

import { Input } from "../../components/ui/input";
import { useMarketplaceField } from "../../components/product-forms/marketplace-form-feedback";

type DeferredInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onCommit?: (value: string) => void;
  onDraftChange?: (value: string) => void;
};

export function DeferredInput({ value, onCommit, onDraftChange, onBlur, ...props }: DeferredInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const feedback = useMarketplaceField(props.name);

  useEffect(() => {
    if (document.activeElement !== inputRef.current && inputRef.current) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <><Input
      {...props}
      ref={inputRef}
      defaultValue={value}
      data-marketplace-field={feedback.key || undefined}
      aria-invalid={feedback.message ? true : props["aria-invalid"]}
      aria-describedby={feedback.message ? feedback.errorId : props["aria-describedby"]}
      onChange={(event) => { feedback.clear(); onDraftChange?.(event.currentTarget.value); }}
      onBlur={(event) => {
        if (onCommit) startTransition(() => onCommit(event.currentTarget.value));
        onBlur?.(event);
      }}
    />{feedback.message ? <span id={feedback.errorId} className="text-xs text-destructive">{feedback.message}</span> : null}</>
  );
}

type DeferredTextareaProps = Omit<ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string;
  onCommit?: (value: string) => void;
  onDraftChange?: (value: string) => void;
};

export function DeferredTextarea({ value, onCommit, onDraftChange, onBlur, ...props }: DeferredTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedback = useMarketplaceField(props.name);

  useEffect(() => {
    if (document.activeElement !== textareaRef.current && textareaRef.current) {
      textareaRef.current.value = value;
    }
  }, [value]);

  return (
    <><textarea
      {...props}
      ref={textareaRef}
      defaultValue={value}
      data-marketplace-field={feedback.key || undefined}
      aria-invalid={feedback.message ? true : props["aria-invalid"]}
      aria-describedby={feedback.message ? feedback.errorId : props["aria-describedby"]}
      className={[props.className, feedback.message ? "border-destructive ring-1 ring-destructive" : ""].filter(Boolean).join(" ")}
      onChange={(event) => { feedback.clear(); onDraftChange?.(event.currentTarget.value); }}
      onBlur={(event) => {
        if (onCommit) startTransition(() => onCommit(event.currentTarget.value));
        onBlur?.(event);
      }}
    />{feedback.message ? <span id={feedback.errorId} className="text-xs text-destructive">{feedback.message}</span> : null}</>
  );
}
