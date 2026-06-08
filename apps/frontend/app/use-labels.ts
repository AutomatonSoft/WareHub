"use client";

import { useEffect, useMemo, useState } from "react";
import { LANG_CHANGE_EVENT, labels, readStoredLang, type Lang } from "./i18n";

export function useLanguage() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const syncLang = () => {
      setLang(readStoredLang());
    };

    syncLang();
    window.addEventListener("storage", syncLang);
    window.addEventListener(LANG_CHANGE_EVENT, syncLang);
    return () => {
      window.removeEventListener("storage", syncLang);
      window.removeEventListener(LANG_CHANGE_EVENT, syncLang);
    };
  }, []);

  return lang;
}

export function useLabels() {
  const lang = useLanguage();

  return useMemo(() => labels[lang], [lang]);
}
