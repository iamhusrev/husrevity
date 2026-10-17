/** Allowlist of menu items a user may reorder. Dashboard and the system section are fixed. */
export const NAV_ITEM_IDS = [
  'reminders',
  'notes',
  'projects',
  'vault',
  'inbox',
  'week',
  'month',
  'goals',
  'evkat',
  'learning',
  'sport',
] as const;

export type NavItemId = (typeof NAV_ITEM_IDS)[number];

export interface NavPreferences {
  sections: {
    core: NavItemId[];
    daily: NavItemId[];
  };
}
