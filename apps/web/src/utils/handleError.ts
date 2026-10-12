import { AxiosError } from "axios";
import i18n from "@/configs/i18n";

export function parseAxiosError(error: unknown): {
  title: string;
  message: string;
} {
  // Unknown JS error
  if (!(error instanceof AxiosError)) {
    return {
      title: "Unexpected Error",
      message: "An unexpected error occurred. Please try again.",
    };
  }

  // Network Error
  if (error.code === "ERR_NETWORK") {
    return {
      title: i18n.t("common.networkErrorTitle"),
      message: i18n.t("common.networkErrorMessage"),
    };
  }

  // Timeout
  if (error.code === "ECONNABORTED") {
    return {
      title: i18n.t("common.timeoutErrorTitle"),
      message: i18n.t("common.timeoutErrorMessage"),
    };
  }

  const backendMessage =
    error.response?.data?.message || error.response?.data?.error || error.response?.data?.detail;

  // Backend message exists
  if (backendMessage) {
    return {
      title: "Error",
      message: backendMessage,
    };
  }

  // Fallback
  return {
    title: "Request Failed",
    message: "Something went wrong. Please try again.",
  };
}
