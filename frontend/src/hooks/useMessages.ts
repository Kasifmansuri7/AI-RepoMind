import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/utils/apiClient";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { Message } from "@/store/chatStore";

interface MessagesResponse {
  items: Message[];
  has_more: boolean;
  total: number;
}

export function useMessages(sessionId: string | null) {
  const activeSessionId = sessionId || 'pending';
  return useInfiniteQuery<MessagesResponse>({
    queryKey: queryKeys.messages(activeSessionId),
    queryFn: async ({ pageParam = 1 }) => {
      if (activeSessionId === 'pending') return { items: [], has_more: false, total: 0 };
      const params = new URLSearchParams({ page: String(pageParam), limit: "50" });
      const res = await apiClient.get(`/chats/${activeSessionId}?${params.toString()}`);
      return res.data;
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage?.has_more ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: true, // Always enabled so we can use the cache even for pending
  });
}

// Helper to update the cache for streaming messages
export function useMessagesCache(sessionId: string | null) {
  const queryClient = useQueryClient();

  const activeSessionId = sessionId || 'pending';

  const addMessage = (message: Message) => {
    queryClient.setQueryData(queryKeys.messages(activeSessionId), (oldData: any) => {
      if (!oldData || !oldData.pages) {
        return { pages: [{ items: [message], has_more: false, total: 1 }], pageParams: [1] };
      }
      
      const newPages = [...oldData.pages];
      if (newPages.length > 0) {
        newPages[0] = {
          ...newPages[0],
          items: [message, ...(newPages[0].items || [])]
        };
      }
      return { ...oldData, pages: newPages };
    });
  };

  const updateLastMessage = (content: string) => {
    queryClient.setQueryData(queryKeys.messages(activeSessionId), (oldData: any) => {
      if (!oldData || !oldData.pages) return oldData;
      
      const newPages = [...oldData.pages];
      if (newPages.length > 0 && newPages[0].items?.length > 0) {
        const updatedItems = [...newPages[0].items];
        updatedItems[0] = { ...updatedItems[0], content };
        newPages[0] = { ...newPages[0], items: updatedItems };
      }
      return { ...oldData, pages: newPages };
    });
  };

  return { addMessage, updateLastMessage };
}
