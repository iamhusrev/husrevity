import { AxiosError } from "axios";
import i18n from "@/configs/i18n";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "./handleError";

/** Best human readable message for a failed request (backend message when there is one). */
export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) return parseAxiosError(err).message;
  if (err instanceof Error && err.message) return err.message;
  return i18n.t("common.error");
}

/** Raises one error alert. Call it from a mutation hook's onError, never per call site. */
export function showErrorAlert(err: unknown): void {
  alertStore.getState().show({
    title: i18n.t("common.error"),
    message: errorMessage(err),
    type: "error",
  });
}
