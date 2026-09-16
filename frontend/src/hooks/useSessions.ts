import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/utils/apiClient";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { ChatSession } from "@/store/chatStore";

interface SessionsResponse {
  items: ChatSession[];
  has_more: boolean;
  total: number;
}

export function useSessions(tenantId: string, search?: string, repoFilter?: string) {
  return useInfiniteQuery<SessionsResponse>({
    queryKey: queryKeys.sessions(search, repoFilter),
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({ page: String(pageParam), limit: "20" });
      if (search) params.append("search", search);
      if (repoFilter && repoFilter !== "all") params.append("repo_id", `${tenantId}_${repoFilter}`);

      const res = await apiClient.get(`/chats?${params.toString()}`);
      return res.data;
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.has_more ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: !!tenantId,
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      await apiClient.delete(`/chats/${sessionId}`);
      return sessionId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions() });
    },
  });
}

export function useForkSession() {
  return useMutation({
    mutationFn: async ({ sessionId, messageId }: { sessionId: string; messageId: string }) => {
      const res = await apiClient.post(`/chats/${sessionId}/fork`, { message_id: messageId });
      return res.data.new_session_id;
    },
  });
}
