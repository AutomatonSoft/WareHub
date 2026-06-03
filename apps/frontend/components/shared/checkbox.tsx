import React from "react";
import { Checkbox as UICheckbox } from "../ui/checkbox";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "checked" | "onChange"> & {
  checked?: boolean;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
};

export function Checkbox({ className, label, ...props }: CheckboxProps) {
  const { checked, onChange, id, name, disabled, required } = props;
  return (
    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <UICheckbox
        className={className}
        checked={Boolean(checked)}
        id={id}
        name={name}
        disabled={disabled}
        required={required}
        onCheckedChange={(nextChecked) => {
          onChange?.({
            target: { checked: nextChecked === true }
          } as React.ChangeEvent<HTMLInputElement>);
        }}
      />
      {label ? <span>{label}</span> : null}
    </label>
  );
}

