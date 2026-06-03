import type { labels } from "../i18n";

export type AuthUser = {
  id: string;
  username: string;
  login: string;
  role: "admin" | "user";
  status: "pending" | "approved" | "rejected";
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export type AuthMode = "login" | "register";
export type ResetStep = "email" | "code" | "password";
export type LoginLabels = (typeof labels)["en"];

