import "./globals.css";
import "react-image-crop/dist/ReactCrop.css";
import type { Metadata } from "next";
import React from "react";
import { ThemeProvider } from "../components/theme/theme-provider";
import { ToastProvider } from "../components/shared/toast-provider";
import { QueryProvider } from "../components/providers/query-provider";
import { AuthBootstrap } from "../components/providers/auth-bootstrap";
import { LanguageSync } from "../components/providers/language-sync";
import { TooltipProvider } from "../components/ui/tooltip";

export const metadata: Metadata = {
  title: "WareHub",
  description: "Premium warehouse intelligence platform",
  icons: {
    icon: "/brand/logo.png",
    apple: "/brand/logo.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const themeBootstrapScript = `
    (function () {
      try {
        var key = "sofortbot_theme";
        var legacyKey = "warehub-theme";
        var theme = "light";
        document.documentElement.setAttribute("data-theme", theme);
        document.documentElement.classList.remove("dark");
        localStorage.setItem(key, theme);
        localStorage.setItem(legacyKey, theme);
      } catch (_) {
        document.documentElement.setAttribute("data-theme", "light");
        document.documentElement.classList.remove("dark");
      }
    })();
  `;
  const sidebarBootstrapScript = `
    (function () {
      try {
        var collapsed = localStorage.getItem("wh:sidebar-collapsed") === "1";
        document.documentElement.style.setProperty("--wh-sidebar-width", collapsed ? "88px" : "260px");
        document.documentElement.setAttribute("data-wh-sidebar-collapsed", collapsed ? "1" : "0");
      } catch (_) {
        document.documentElement.style.setProperty("--wh-sidebar-width", "260px");
        document.documentElement.setAttribute("data-wh-sidebar-collapsed", "0");
      }
    })();
  `;
  const languageBootstrapScript = `
    (function () {
      try {
        var key = "sofortbot_lang";
        var saved = localStorage.getItem(key);
        var lang = saved === "ru" || saved === "de" || saved === "en" ? saved : "en";
        document.documentElement.lang = lang;
      } catch (_) {
        document.documentElement.lang = "en";
      }
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="relative min-h-screen bg-background font-sans text-foreground antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: sidebarBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: languageBootstrapScript }} />
        <div className="relative z-20">
          <QueryProvider>
            <ThemeProvider>
              <TooltipProvider>
                <ToastProvider>
                  <LanguageSync />
                  <AuthBootstrap>{children}</AuthBootstrap>
                </ToastProvider>
              </TooltipProvider>
            </ThemeProvider>
          </QueryProvider>
        </div>
      </body>
    </html>
  );
}
