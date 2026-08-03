"use client";

import { startTransition, useEffect, useRef, type ComponentProps } from "react";

import { Input } from "../../components/ui/input";

type DeferredInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string;
  onCommit?: (value: string) => void;
  onDraftChange?: (value: string) => void;
};

export function DeferredInput({ value, onCommit, onDraftChange, onBlur, ...props }: DeferredInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current && inputRef.current) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <Input
      {...props}
      ref={inputRef}
      defaultValue={value}
      onChange={(event) => onDraftChange?.(event.currentTarget.value)}
      onBlur={(event) => {
        if (onCommit) startTransition(() => onCommit(event.currentTarget.value));
        onBlur?.(event);
      }}
    />
  );
}

type DeferredTextareaProps = Omit<ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string;
  onCommit?: (value: string) => void;
  onDraftChange?: (value: string) => void;
};

export function DeferredTextarea({ value, onCommit, onDraftChange, onBlur, ...props }: DeferredTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (document.activeElement !== textareaRef.current && textareaRef.current) {
      textareaRef.current.value = value;
    }
  }, [value]);

  return (
    <textarea
      {...props}
      ref={textareaRef}
      defaultValue={value}
      onChange={(event) => onDraftChange?.(event.currentTarget.value)}
      onBlur={(event) => {
        if (onCommit) startTransition(() => onCommit(event.currentTarget.value));
        onBlur?.(event);
      }}
    />
  );
}
