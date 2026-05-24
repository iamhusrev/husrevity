import { Metadata } from "next";

export const LANGUAGES = {
  tr: { key: "tr", name: "tr_TR" },
  en: { key: "en", name: "en_US" },
};

export const META_DATA: Metadata = {
  title: "husrevity",
  description: "Personal productivity suite — notes, lists, plans, mail.",
};

export const LOCAL_STORAGE_KEYS = {
  ACCESS_TOKEN: "access-token",
  REFRESH_TOKEN: "refresh-token",
  USER: "auth-user",
};
