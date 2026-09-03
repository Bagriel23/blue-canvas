import type { UiLocale } from "@blue-canvas/ui";

export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  locale: UiLocale;
  status: "active" | "disabled";
  isAdmin: boolean;
}

export interface SessionInfo {
  user: UserSummary;
  csrfToken: string;
  bootstrapRequired: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  role: "owner" | "editor" | "commenter" | "viewer";
}

export interface ProjectMember {
  userId: string;
  email: string;
  displayName: string;
  role: "owner" | "editor" | "commenter" | "viewer";
  addedAt: string;
}

export interface PersonalAccessTokenSummary {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
}
