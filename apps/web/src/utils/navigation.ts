export type NavItemLike = {
  path?: string;
  subItems?: Array<{ path: string }>;
};

/**
 * Checks whether a navigation item or path is currently active.
 * Handles segment boundaries (`/projects/12` matches `/projects`, but `/projectsfoo` does not)
 * and trailing slashes. Also checks if any child of a parent item matches.
 */
export function isNavItemActive(
  pathname: string,
  target: string | NavItemLike,
): boolean {
  if (!pathname || !target) return false;

  if (typeof target === "object") {
    if (target.path && isNavItemActive(pathname, target.path)) {
      return true;
    }
    if (target.subItems && target.subItems.length > 0) {
      return target.subItems.some((sub) => isNavItemActive(pathname, sub.path));
    }
    return false;
  }

  const clean = (url: string) => {
    if (url.length > 1 && url.endsWith("/")) {
      return url.slice(0, -1);
    }
    return url;
  };

  const normPathname = clean(pathname);
  const normPath = clean(target);

  if (!normPath) return false;
  if (normPathname === normPath) return true;
  if (normPath !== "/" && normPathname.startsWith(`${normPath}/`)) return true;

  return false;
}
