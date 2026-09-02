import type { Metadata } from "next";
import LearningPage from "@/views/learning/LearningPage";

export const metadata: Metadata = { title: "Learning | Husrevity", description: "Track what you're learning, item by item." };
export default function Page() { return <LearningPage />; }
