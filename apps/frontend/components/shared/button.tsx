import React from "react";
import { Loader2 } from "lucide-react";
import { Button as UIButton } from "../ui/button";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
};

const variantMap: Record<ButtonVariant, "default" | "secondary" | "ghost"> = {
  primary: "default",
  secondary: "secondary",
  ghost: "ghost"
};

export function Button({ className, variant = "primary", loading = false, children, disabled, ...props }: ButtonProps) {
  return (
    <UIButton
      variant={variantMap[variant]}
      className={cn(loading ? "pointer-events-none" : "", className)}
      disabled={disabled || loading}
      aria-busy={loading ? "true" : undefined}
      {...props}
    >
      {loading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
      <span className={cn("inline-flex items-center gap-2 whitespace-nowrap", loading ? "opacity-85" : "")}>
        {children}
      </span>
    </UIButton>
  );
}
