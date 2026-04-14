import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type CurrentUser = {
  id: number;
  email: string;
  name: string;
  avatar: string | null;
};

export function useAuth() {
  const query = useQuery<CurrentUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await api<CurrentUser>("/api/auth/me");
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data,
  };
}
