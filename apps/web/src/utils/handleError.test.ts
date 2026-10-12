import { describe, it, expect, afterEach } from "vitest";
import { AxiosError } from "axios";
import i18n from "@/configs/i18n";
import { parseAxiosError } from "./handleError";

describe("parseAxiosError generic network messages", () => {
  const original = i18n.language;

  afterEach(async () => {
    await i18n.changeLanguage(original);
  });

  it("returns Turkish network and timeout messages when the language is Turkish", async () => {
    await i18n.changeLanguage("tr");
    const network = parseAxiosError(new AxiosError("x", "ERR_NETWORK"));
    expect(network.title).toBe(i18n.t("common.networkErrorTitle"));
    expect(network.message).toBe(i18n.t("common.networkErrorMessage"));
    expect(network.message).not.toMatch(/Unable to connect/);

    const timeout = parseAxiosError(new AxiosError("x", "ECONNABORTED"));
    expect(timeout.title).toBe(i18n.t("common.timeoutErrorTitle"));
    expect(timeout.message).toBe(i18n.t("common.timeoutErrorMessage"));
    expect(timeout.message).not.toMatch(/took too long/);
  });

  it("returns English network and timeout messages when the language is English", async () => {
    await i18n.changeLanguage("en");
    expect(parseAxiosError(new AxiosError("x", "ERR_NETWORK"))).toEqual({
      title: "Network Error",
      message: "Unable to connect to the server. Please check your internet connection.",
    });
    expect(parseAxiosError(new AxiosError("x", "ECONNABORTED"))).toEqual({
      title: "Request Timeout",
      message: "The request took too long. Please try again.",
    });
  });

  it("keeps the backend message untouched", async () => {
    await i18n.changeLanguage("tr");
    const err = new AxiosError("x", "ERR_BAD_REQUEST", undefined, null, {
      data: { message: "Server says no" },
      status: 400,
      statusText: "",
      headers: {},
      config: {} as never,
    });
    expect(parseAxiosError(err).message).toBe("Server says no");
  });
});
