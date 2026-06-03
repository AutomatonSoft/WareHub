import React from "react";
import { Textarea as UITextarea } from "../ui/textarea";

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <UITextarea {...props} />;
}

