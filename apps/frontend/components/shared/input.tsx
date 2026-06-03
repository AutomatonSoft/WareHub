import React from "react";
import { Input as UIInput } from "../ui/input";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <UIInput {...props} />;
}
