import type { NavItemId, NavPreferences, NavSectionId } from "@/types/user/user";
import { NAV_ITEM_IDS, NAV_REGISTRY } from "./nav-items";

export type NavOrder = Record<NavSectionId, NavItemId[]>;

const SECTIONS: NavSectionId[] = ["core", "daily"];

const buildDefault = (): NavOrder => ({
  core: NAV_ITEM_IDS.filter((id) => NAV_REGISTRY[id].defaultSection === "core"),
  daily: NAV_ITEM_IDS.filter((id) => NAV_REGISTRY[id].defaultSection === "daily"),
});

export const DEFAULT_NAV_ORDER: NavOrder = buildDefault();

/**
 * Merges saved preferences with the registry: unknown and duplicate ids are
 * dropped, and items missing from the saved order (e.g. added after it was
 * saved) are appended to their default section.
 */
export function resolveNavOrder(prefs: NavPreferences | null | undefined): NavOrder {
  if (!prefs) return buildDefault();

  const seen = new Set<NavItemId>();
  const order: NavOrder = { core: [], daily: [] };
  for (const section of SECTIONS) {
    for (const id of prefs.sections?.[section] ?? []) {
      if (id in NAV_REGISTRY && !seen.has(id)) {
        seen.add(id);
        order[section].push(id);
      }
    }
  }
  for (const id of NAV_ITEM_IDS) {
    if (!seen.has(id)) order[NAV_REGISTRY[id].defaultSection].push(id);
  }
  return order;
}

/** Moves `id` to `index` of `toSection` (index clamped). Returns a new order; the input is untouched. */
export function moveNavItem(
  order: NavOrder,
  id: NavItemId,
  toSection: NavSectionId,
  index: number,
): NavOrder {
  if (!SECTIONS.some((s) => order[s].includes(id))) return order;

  const next: NavOrder = {
    core: order.core.filter((x) => x !== id),
    daily: order.daily.filter((x) => x !== id),
  };
  const at = Math.max(0, Math.min(index, next[toSection].length));
  next[toSection].splice(at, 0, id);
  return next;
}

/** Moves `id` one step up (-1) or down (1), crossing into the neighbouring section at a boundary. */
export function stepNavItem(order: NavOrder, id: NavItemId, dir: -1 | 1): NavOrder {
  const section = SECTIONS.find((s) => order[s].includes(id));
  if (!section) return order;
  const index = order[section].indexOf(id);

  if (dir === -1) {
    if (index > 0) return moveNavItem(order, id, section, index - 1);
    return section === "daily" ? moveNavItem(order, id, "core", order.core.length) : order;
  }
  if (index < order[section].length - 1) return moveNavItem(order, id, section, index + 1);
  return section === "core" ? moveNavItem(order, id, "daily", 0) : order;
}

export const toNavPreferences = (order: NavOrder): NavPreferences => ({
  sections: { core: [...order.core], daily: [...order.daily] },
});

export const isSameNavOrder = (a: NavOrder, b: NavOrder): boolean =>
  SECTIONS.every((s) => a[s].length === b[s].length && a[s].every((id, i) => id === b[s][i]));
