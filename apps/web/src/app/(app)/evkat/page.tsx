import type { Metadata } from "next";
import EvkatPage from "@/views/evkat/EvkatPage";

export const metadata: Metadata = {
  title: "Evkat | Husrevity",
  description: "Günü saat saat planla — Husrevity'nin Evkat modülü.",
};

export default function Page() {
  return <EvkatPage />;
}
