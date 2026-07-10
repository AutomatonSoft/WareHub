"use client";

import { useEffect } from "react";
import { useLanguage } from "../../app/use-labels";

export function LanguageSync() {
  const lang = useLanguage();

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
