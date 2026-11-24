import { LOCAL_STORAGE_KEYS } from "@/utils/constants-common";
import { HOME_PAGE } from "@/utils/constants-url";

/**
 * Static inline script (no user input) for the public home page only. It runs
 * before first paint and sends visitors with a stored session straight to the
 * dashboard, using the same localStorage key AuthService reads. Storage access
 * can throw (blocked cookies), so it is wrapped and fails open to the page.
 */
export const HOME_REDIRECT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(
  LOCAL_STORAGE_KEYS.ACCESS_TOKEN,
)})){location.replace(${JSON.stringify(HOME_PAGE)});}}catch(e){}`;
