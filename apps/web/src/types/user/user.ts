export interface UserResponse {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  enabled: boolean;
  /**
   * When true (and the API has SMTP configured), the dispatcher cron also
   * sends an email for every notification it fans out. Toggled from the
   * profile settings page.
   */
  emailNotificationsEnabled: boolean;
  /** 'user' | 'admin'. Admin-only sections of the app are gated by this. */
  role: string;
  /** Saved sidebar order; null means the built-in default order. */
  navPreferences: NavPreferences | null;
}

export type NavItemId =
  | "reminders"
  | "notes"
  | "projects"
  | "vault"
  | "inbox"
  | "week"
  | "month"
  | "goals"
  | "evkat"
  | "learning"
  | "sport";

export type NavSectionId = "core" | "daily";

export interface NavPreferences {
  sections: Record<NavSectionId, NavItemId[]>;
}

/** Lightweight profile for pickers/directories — not the full `UserResponse`. */
export interface UserSummary {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
}

export interface NotificationPreferencesRequest {
  email?: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
