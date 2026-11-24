import GoogleCallbackView from "@/views/auth/GoogleCallbackView";

export const metadata = {
  title: "Google sign-in",
  referrer: "no-referrer",
};

export default function Page() {
  return <GoogleCallbackView />;
}
