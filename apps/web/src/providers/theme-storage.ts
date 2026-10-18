// Not a client module on purpose: the root layout (a server component) imports THEME_INIT_SCRIPT
// from here, and values imported from a "use client" file would arrive as client references.

/** Explicit choices live here. A missing value means "follow the system". */
export const THEME_STORAGE_KEY = "theme-preference";
export const LEGACY_THEME_KEY = "theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before first paint so a dark device never flashes light. It must reach the same
 * decision as ThemeProvider: an explicit stored choice wins, a legacy "dark" is kept, anything else
 * follows the OS. Everything is wrapped in try/catch because storage and matchMedia can throw.
 */
export const THEME_INIT_SCRIPT = `(function(){var dark=false;try{dark=window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches}catch(e){}try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(s==="dark")dark=true;else if(s==="light")dark=false;else if(s!=="system"&&localStorage.getItem(${JSON.stringify(
  LEGACY_THEME_KEY,
)})==="dark")dark=true}catch(e){}document.documentElement.classList.toggle("dark",dark)})();`;
