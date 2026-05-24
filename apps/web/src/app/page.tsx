import { redirect } from "next/navigation";
import { LOGIN_PAGE } from "@/utils/constants-url";

export default function RootPage() {
  redirect(LOGIN_PAGE);
}
