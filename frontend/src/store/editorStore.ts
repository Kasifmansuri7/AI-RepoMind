import { create } from 'zustand';
import apiClient from '@/utils/apiClient';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface EditorState {
  fileTree: FileNode | null;
  activeFile: string | null;
  fileContent: string;
  originalFileContent: string;
  isTreeLoading: boolean;
  isFileLoading: boolean;
  isSaving: boolean;
  error: string | null;

  setFileTree: (tree: FileNode | null) => void;
  setActiveFile: (path: string | null) => void;
  setFileContent: (content: string) => void;
  
  fetchFileTree: (repoId: string) => Promise<void>;
  fetchFileContent: (repoId: string, path: string) => Promise<void>;
  saveFileContent: (repoId: string, path: string, content: string, commitMessage?: string) => Promise<void>;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  fileTree: null,
  activeFile: null,
  fileContent: "",
  originalFileContent: "",
  isTreeLoading: false,
  isFileLoading: false,
  isSaving: false,
  error: null,

  setFileTree: (tree) => set({ fileTree: tree }),
  
  setActiveFile: (path) => {
    set({ activeFile: path });
    // When clearing active file, clear content
    if (!path) {
      set({ fileContent: "", originalFileContent: "" });
    }
  },
  
  setFileContent: (content) => set({ fileContent: content }),

  fetchFileTree: async (repoId: string) => {
    set({ isTreeLoading: true, error: null });
    try {
      const response = await apiClient.get(`/repos/${encodeURIComponent(repoId)}/files/tree`);
      set({ fileTree: response.data, isTreeLoading: false });
    } catch (err: any) {
      console.error("Failed to fetch file tree:", err);
      set({ error: err.response?.data?.detail || "Failed to load file tree", isTreeLoading: false });
    }
  },

  fetchFileContent: async (repoId: string, path: string) => {
    set({ isFileLoading: true, error: null, activeFile: path });
    try {
      const response = await apiClient.get(`/repos/${encodeURIComponent(repoId)}/files/content`, {
        params: { path }
      });
      set({ 
        fileContent: response.data.content, 
        originalFileContent: response.data.content,
        isFileLoading: false 
      });
    } catch (err: any) {
      console.error("Failed to fetch file content:", err);
      set({ 
        error: err.response?.data?.detail || "Failed to load file", 
        fileContent: "",
        originalFileContent: "",
        isFileLoading: false 
      });
    }
  },

  saveFileContent: async (repoId: string, path: string, content: string, commitMessage?: string) => {
    set({ isSaving: true, error: null });
    try {
      const headers: Record<string, string> = {};
      if (commitMessage) {
        headers["X-Commit-Message"] = commitMessage;
      }
      await apiClient.put(`/repos/${encodeURIComponent(repoId)}/files/content`, { content }, {
        params: { path },
        headers
      });
      set({ originalFileContent: content, isSaving: false });
    } catch (err: any) {
      console.error("Failed to save file:", err);
      set({ error: err.response?.data?.detail || "Failed to save file", isSaving: false });
      throw err;
    }
  }
}));
