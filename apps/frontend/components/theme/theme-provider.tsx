"use client";

import React, { createContext, useCallback, useContext, useMemo, useEffect, useState } from "react";

type ThemeMode = "light";

type ThemeContextValue = {
  theme: ThemeMode;
};

const STORAGE_KEY = "sofortbot_theme";
const LEGACY_STORAGE_KEY = "warehub-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    setThemeState("light");
    window.localStorage.setItem(STORAGE_KEY, "light");
    window.localStorage.setItem(LEGACY_STORAGE_KEY, "light");
    applyTheme("light");
  }, []);

  const ensureLightTheme = useCallback(() => {
    setThemeState("light");
    window.localStorage.setItem(STORAGE_KEY, "light");
    window.localStorage.setItem(LEGACY_STORAGE_KEY, "light");
    applyTheme("light");
  }, []);

  const value = useMemo(
    () => ({
      theme
    }),
    [theme]
  );

  useEffect(() => {
    ensureLightTheme();
  }, [ensureLightTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within ThemeProvider");
  }

  return context;
}
