import { AxiosError } from "axios";

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
      title: "Network Error",
      message: "Unable to connect to the server. Please check your internet connection.",
    };
  }

  // Timeout
  if (error.code === "ECONNABORTED") {
    return {
      title: "Request Timeout",
      message: "The request took too long. Please try again.",
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
