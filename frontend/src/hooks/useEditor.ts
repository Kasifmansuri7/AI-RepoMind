import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/utils/apiClient";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { FileNode } from "@/store/editorStore";

export function useFileTree(repoId: string | undefined) {
  return useQuery<FileNode>({
    queryKey: queryKeys.fileTree(repoId!),
    queryFn: async () => {
      const res = await apiClient.get(`/repos/${encodeURIComponent(repoId!)}/files/tree`);
      return res.data;
    },
    enabled: !!repoId,
  });
}

export function useFileContent(repoId: string | undefined, path: string | null) {
  return useQuery<{ content: string }>({
    queryKey: queryKeys.fileContent(repoId!, path!),
    queryFn: async () => {
      const res = await apiClient.get(`/repos/${encodeURIComponent(repoId!)}/files/content`, {
        params: { path }
      });
      return res.data;
    },
    enabled: !!repoId && !!path,
  });
}

export function useSaveFileContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ repoId, path, content, commitMessage }: { repoId: string, path: string, content: string, commitMessage?: string }) => {
      const headers: Record<string, string> = {};
      if (commitMessage) headers["X-Commit-Message"] = commitMessage;

      await apiClient.put(`/repos/${encodeURIComponent(repoId)}/files/content`, { content }, {
        params: { path },
        headers
      });
      return { repoId, path, content };
    },
    onSuccess: ({ repoId, path, content }) => {
      // Update cache immediately
      queryClient.setQueryData(queryKeys.fileContent(repoId, path), { content });
      queryClient.invalidateQueries({ queryKey: queryKeys.fileTree(repoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.architecture(repoId) });
    },
  });
}

export function useBulkCommit() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ repoId, message, files }: { repoId: string, message: string, files: Record<string, string> }) => {
      await apiClient.post(`/repos/${encodeURIComponent(repoId)}/files/bulk-commit`, {
        message,
        files
      });
      return { repoId, files };
    },
    onSuccess: ({ repoId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.architecture(repoId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.fileTree(repoId) });
    }
  });
}

export function useGenerateCommitMessage() {
  return useMutation({
    mutationFn: async ({ repoId, files }: { repoId: string, files: Record<string, { original: string, current: string }> }) => {
      const res = await apiClient.post(`/repos/${encodeURIComponent(repoId)}/files/generate-commit-message`, { files });
      return res.data.message as string;
    },
  });
}
