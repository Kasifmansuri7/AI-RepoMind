import { create } from 'zustand';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface EditorState {
  activeFile: string | null;
  fileContent: string;
  originalFileContent: string;
  modifiedFiles: Record<string, { original: string, current: string }>;

  setActiveFile: (path: string | null) => void;
  setFileContent: (content: string) => void;
  setOriginalFileContent: (content: string) => void;
  
  updateModifiedFile: (path: string, original: string, current: string) => void;
  revertFile: (path: string) => void;
  clearModifiedFiles: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  activeFile: null,
  fileContent: "",
  originalFileContent: "",
  modifiedFiles: {},

  setActiveFile: (path) => {
    set({ activeFile: path });
    if (!path) {
      set({ fileContent: "", originalFileContent: "" });
    }
  },
  
  setFileContent: (content) => set({ fileContent: content }),
  setOriginalFileContent: (content) => set({ originalFileContent: content }),

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

  clearModifiedFiles: () => set({ modifiedFiles: {} })
}));
