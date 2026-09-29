import type { Metadata } from "next";
import DigerPage from "@/views/diger/DigerPage";

export const metadata: Metadata = {
  title: "Diğer",
  description: "Vault, Spor, Öğrenme ve diğer ekranlara buradan ulaş.",
};
export default function Page() {
  return <DigerPage />;
}
