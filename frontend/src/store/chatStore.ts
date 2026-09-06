import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Message = { role: "user" | "assistant", content: string };

interface ChatState {
  tenantId: string;
  isLoggedIn: boolean;
  messages: Message[];
  repoName: string;
  setTenantId: (id: string) => void;
  setIsLoggedIn: (status: boolean) => void;
  setMessages: (msgs: Message[]) => void;
  setRepoName: (name: string) => void;
  addMessage: (msg: Message) => void;
  logout: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      tenantId: "",
      isLoggedIn: false,
      messages: [],
      repoName: "AI-RepoMind",
      setTenantId: (id) => set({ tenantId: id }),
      setIsLoggedIn: (status) => set({ isLoggedIn: status }),
      setMessages: (msgs) => set({ messages: msgs }),
      setRepoName: (name) => set({ repoName: name }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      logout: () => set({ isLoggedIn: false, messages: [], tenantId: "" }),
    }),
    {
      name: 'repomind-storage', 
    }
  )
);
