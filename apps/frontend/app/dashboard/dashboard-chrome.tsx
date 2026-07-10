"use client";

import { Languages, LayoutDashboard, LogOut, Menu, Moon, Settings2, ShieldCheck, Sun, X } from "lucide-react";
import React from "react";

import { useLabels } from "../use-labels";
import styles from "./dashboard-nav.module.css";

type DashboardViewName = "dashboard" | "admin" | "account";

type DashboardNavLabels = {
  dashboard: string;
  admin: string;
  account: string;
};

type DashboardChromeProps = {
  theme: "dark" | "light";
  lang: "en" | "ru" | "de";
  navOpen: boolean;
  canApprove: boolean;
  activeView: DashboardViewName;
  navLabels: DashboardNavLabels;
  username: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
  navToggleButtonRef: React.RefObject<HTMLButtonElement | null>;
  navDrawerRef: React.RefObject<HTMLElement | null>;
  onToggleTheme: () => void;
  onSwitchLanguage: () => void;
  onLogout: () => void;
  onOpenNav: () => void;
  onCloseNav: () => void;
  onSwitchView: (next: DashboardViewName) => void;
};

export function DashboardChrome({
  theme,
  lang,
  navOpen,
  canApprove,
  activeView,
  navLabels,
  username,
  role,
  status,
  navToggleButtonRef,
  navDrawerRef,
  onToggleTheme,
  onSwitchLanguage,
  onLogout,
  onOpenNav,
  onCloseNav,
  onSwitchView
}: DashboardChromeProps) {
  const t = useLabels();
  const localizedRole = role === "admin" ? t.adminTitle : t.user;
  const localizedStatus = status === "approved" ? t.approved : status === "pending" ? t.pending : t.rejected;

  return (
    <>
      <div className={styles.pageToolsLeft}>
        <button
          type="button"
          className="icon-button small-icon"
          ref={navToggleButtonRef}
          onClick={onOpenNav}
          aria-label={t.openNavigation}
          aria-expanded={navOpen}
          aria-controls="dashboard-nav"
        >
          <Menu size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="page-tools">
        <button type="button" className="icon-button small-icon" onClick={onToggleTheme} aria-label={t.toggleTheme}>
          {theme === "light" ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="icon-button small-icon lang-icon"
          onClick={onSwitchLanguage}
          aria-label={t.languageSwitcherAria}
          title={t.languageTitle.replace("{lang}", lang.toUpperCase())}
        >
          <Languages size={18} aria-hidden="true" />
        </button>
        <button className="icon-button small-icon" onClick={onLogout} title={t.logout} aria-label={t.logout}>
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>

      <div
        className={`${styles.navBackdrop} ${navOpen ? styles.navBackdropOpen : ""}`}
        role="presentation"
        onClick={onCloseNav}
        aria-hidden={!navOpen}
      />
      <aside
        className={`${styles.navDrawer} ${navOpen ? styles.navDrawerOpen : ""}`}
        id="dashboard-nav"
        ref={navDrawerRef}
        aria-hidden={!navOpen}
        aria-label={t.primaryNavigation}
      >
        <div className={styles.navHeader}>
          <div className="brand-row">
            <span className={styles.navTitle}>{t.brandName}</span>
          </div>
          <button type="button" className="icon-button small-icon" onClick={onCloseNav} aria-label={t.closeMenu}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav className={styles.navButtons}>
          <button
            type="button"
            className={`${styles.navButton} ${activeView === "account" ? styles.navButtonActive : ""}`}
            onClick={() => onSwitchView("account")}
            aria-current={activeView === "account" ? "page" : undefined}
          >
            <Settings2 size={16} aria-hidden="true" />
            <span>{navLabels.account}</span>
          </button>
          <button
            type="button"
            className={`${styles.navButton} ${activeView === "dashboard" ? styles.navButtonActive : ""}`}
            onClick={() => onSwitchView("dashboard")}
            aria-current={activeView === "dashboard" ? "page" : undefined}
          >
            <LayoutDashboard size={16} aria-hidden="true" />
            <span>{navLabels.dashboard}</span>
          </button>
          <button
            type="button"
            className={`${styles.navButton} ${activeView === "admin" ? styles.navButtonActive : ""}`}
            onClick={() => onSwitchView("admin")}
            aria-current={activeView === "admin" ? "page" : undefined}
            disabled={!canApprove}
          >
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{navLabels.admin}</span>
            {!canApprove ? <span className={styles.navBadge}>{t.adminTitle}</span> : null}
          </button>
        </nav>
        <div className={styles.navFooter}>
          <span>{username}</span>
          <span className={styles.navMuted}>
            {localizedRole} · {localizedStatus}
          </span>
        </div>
      </aside>
    </>
  );
}
