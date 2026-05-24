import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import tr from "@/messages/tr.json";
import en from "@/messages/en.json";

i18n
  .use(initReactI18next) // hook'lar için gerekli
  .init({
    resources: {
      tr: { common: tr },
      en: { common: en },
    },
    fallbackLng: "tr",
    supportedLngs: ["tr", "en"],
    ns: ["common"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    react: {
      useSuspense: false, // App Router ile suspence kapatmak önemli
    },
  });

export default i18n;
