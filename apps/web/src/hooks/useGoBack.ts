import { DASHBOARD_PAGE } from "@/utils/constants-url";
import { useRouter } from "next/navigation";

const useGoBack = () => {
  const router = useRouter();

  const goBack = () => {
    if (window.history.length > 1) {
      router.back(); // Navigate to the previous route
    } else {
      router.push(DASHBOARD_PAGE); // Redirect to home if no history exists
    }
  };

  return goBack;
};

export default useGoBack;
