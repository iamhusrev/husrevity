import type { IconType } from "react-icons";
import {
  BiArchiveIn,
  BiBell,
  BiBookOpen,
  BiCalendar,
  BiCalendarWeek,
  BiDumbbell,
  BiFolder,
  BiLockAlt,
  BiNote,
  BiTargetLock,
} from "react-icons/bi";
import { HiOutlineClock } from "react-icons/hi2";
import type { NavItemId, NavSectionId } from "@/types/user/user";

export type NavRegistryEntry = {
  /** i18n key of the label. */
  key: string;
  path: string;
  icon: IconType;
  defaultSection: NavSectionId;
};

/** Single source of truth for the reorderable menu items (sidebar and mobile "More" sheet). */
export const NAV_REGISTRY: Record<NavItemId, NavRegistryEntry> = {
  reminders: { key: "nav.reminders", path: "/reminders", icon: BiBell, defaultSection: "core" },
  notes: { key: "nav.notes", path: "/notes", icon: BiNote, defaultSection: "core" },
  projects: { key: "nav.projects", path: "/projects", icon: BiFolder, defaultSection: "core" },
  vault: { key: "nav.vault", path: "/vault", icon: BiLockAlt, defaultSection: "core" },
  inbox: { key: "nav.inbox", path: "/inbox", icon: BiArchiveIn, defaultSection: "daily" },
  week: { key: "nav.week", path: "/week", icon: BiCalendarWeek, defaultSection: "daily" },
  month: { key: "nav.calendar", path: "/month", icon: BiCalendar, defaultSection: "daily" },
  goals: { key: "nav.goals", path: "/goals", icon: BiTargetLock, defaultSection: "daily" },
  evkat: { key: "nav.evkat", path: "/evkat", icon: HiOutlineClock, defaultSection: "daily" },
  learning: { key: "nav.learning", path: "/learning", icon: BiBookOpen, defaultSection: "daily" },
  sport: { key: "nav.sport", path: "/sport", icon: BiDumbbell, defaultSection: "daily" },
};

/** Registry order doubles as the default order within each section. */
export const NAV_ITEM_IDS = Object.keys(NAV_REGISTRY) as NavItemId[];
