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
  isCommitting: boolean;
  error: string | null;
  modifiedFiles: Record<string, { original: string, current: string }>;

  setFileTree: (tree: FileNode | null) => void;
  setActiveFile: (path: string | null) => void;
  setFileContent: (content: string) => void;
  
  fetchFileTree: (repoId: string) => Promise<void>;
  fetchFileContent: (repoId: string, path: string) => Promise<void>;
  saveFileContent: (repoId: string, path: string, content: string, commitMessage?: string) => Promise<void>;
  
  updateModifiedFile: (path: string, original: string, current: string) => void;
  revertFile: (path: string) => void;
  bulkCommit: (repoId: string, message: string) => Promise<void>;
  generateCommitMessage: (repoId: string) => Promise<string>;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  fileTree: null,
  activeFile: null,
  fileContent: "",
  originalFileContent: "",
  isTreeLoading: false,
  isFileLoading: false,
  isSaving: false,
  isCommitting: false,
  error: null,
  modifiedFiles: {},

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
  },

  updateModifiedFile: (path, original, current) => {
    set((state) => {
      const newModified = { ...state.modifiedFiles };
      if (original === current) {
        delete newModified[path];
      } else {
        newModified[path] = { original, current };
      }
      return { modifiedFiles: newModified };
    });
  },

  revertFile: (path) => {
    set((state) => {
      const newModified = { ...state.modifiedFiles };
      delete newModified[path];
      return { modifiedFiles: newModified };
    });
  },

  bulkCommit: async (repoId: string, message: string) => {
    const { modifiedFiles } = get();
    if (Object.keys(modifiedFiles).length === 0) return;
    
    set({ isCommitting: true, error: null });
    try {
      const filesPayload = Object.fromEntries(
        Object.entries(modifiedFiles).map(([path, data]) => [path, data.current])
      );
      
      await apiClient.post(`/repos/${encodeURIComponent(repoId)}/files/bulk-commit`, {
        message,
        files: filesPayload
      });
      
      // On success, clear modified files
      set({ modifiedFiles: {}, isCommitting: false });
    } catch (err: any) {
      console.error("Bulk commit failed:", err);
      set({ error: err.response?.data?.detail || "Bulk commit failed", isCommitting: false });
      throw err;
    }
  },

  generateCommitMessage: async (repoId: string) => {
    const { modifiedFiles } = get();
    if (Object.keys(modifiedFiles).length === 0) return "";
    
    try {
      const response = await apiClient.post(`/repos/${encodeURIComponent(repoId)}/files/generate-commit-message`, {
        files: modifiedFiles
      });
      return response.data.message;
    } catch (err: any) {
      console.error("Generate commit message failed:", err);
      throw err;
    }
  }
}));
