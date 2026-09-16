import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/utils/apiClient";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { Repo } from "@/store/chatStore";

export function useRepos() {
  return useQuery<Repo[]>({
    queryKey: queryKeys.repos(),
    queryFn: async () => {
      const res = await apiClient.get("/repos");
      return res.data;
    },
  });
}

export function useArchitecture(repoId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.architecture(repoId!),
    queryFn: async () => {
      const res = await apiClient.get(`/repos/${encodeURIComponent(repoId!)}/architecture`);
      return res.data;
    },
    enabled: !!repoId,
    staleTime: Infinity, // Optimize LLM api calls by caching indefinitely during the session
    gcTime: 24 * 60 * 60 * 1000, // Keep in garbage collection cache for 24 hours
  });
}

export function useDeleteRepo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (repoId: string) => {
      await apiClient.delete(`/repos/${encodeURIComponent(repoId)}`);
      return repoId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repos() });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
    },
  });
}
