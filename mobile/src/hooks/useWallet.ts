import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";

export const walletKey = ["wallet"] as const;

export function useWallet() {
  return useQuery({
    queryKey: walletKey,
    queryFn: api.getWallet,
    staleTime: 30_000,
    // The API client already retries GETs with backoff.
    retry: false,
  });
}
