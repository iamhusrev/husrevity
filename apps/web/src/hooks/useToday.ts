import { useQuery } from "@tanstack/react-query";
import { todayService } from "@/services/today-service";

export function useToday() {
  return useQuery({
    queryKey: ["today"],
    queryFn: () => todayService.getToday(),
    select: (d) => d.data,
    // The active block/timeline shifts minute to minute — keep it fresh
    // without the user having to manually refresh the page.
    refetchInterval: 60_000,
  });
}
