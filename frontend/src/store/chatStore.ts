import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Message = { role: "user" | "assistant", content: string };
export type Repo = { id: string, name: string, url: string };
export type ChatSession = { id: string, repo_id: string, created_at: string };

interface ChatState {
  tenantId: string;
  isLoggedIn: boolean;
  messages: Message[];
  repoName: string;
  repos: Repo[];
  sessions: ChatSession[];
  currentSessionId: string | null;
  
  setTenantId: (id: string) => void;
  setIsLoggedIn: (status: boolean) => void;
  setMessages: (msgs: Message[]) => void;
  setRepoName: (name: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  addMessage: (msg: Message) => void;
  logout: () => void;
  
  fetchRepos: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      tenantId: "",
      isLoggedIn: false,
      messages: [],
      repoName: "",
      repos: [],
      sessions: [],
      currentSessionId: null,
      
      setTenantId: (id) => set({ tenantId: id }),
      setIsLoggedIn: (status) => set({ isLoggedIn: status }),
      setMessages: (msgs) => set({ messages: msgs }),
      setRepoName: (name) => set({ repoName: name }),
      setCurrentSessionId: (id) => set({ currentSessionId: id }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      logout: () => set({ isLoggedIn: false, messages: [], tenantId: "", repos: [], sessions: [], repoName: "", currentSessionId: null }),
      
      fetchRepos: async () => {
        const { tenantId } = get();
        if (!tenantId) return;
        try {
          const res = await axios.get(`${API_URL}/api/repos`, {
            headers: { "X-Tenant-ID": tenantId }
          });
          const data = res.data;
          set({ repos: data });
          if (data.length > 0 && !get().repoName) {
            set({ repoName: data[0].name });
          }
        } catch (e) {
          console.error(e);
        }
      },
      
      fetchSessions: async () => {
        const { tenantId } = get();
        if (!tenantId) return;
        try {
          const res = await axios.get(`${API_URL}/api/chats`, {
            headers: { "X-Tenant-ID": tenantId }
          });
          set({ sessions: res.data });
        } catch (e) {
          console.error(e);
        }
      },
      
      fetchMessages: async (sessionId: string) => {
        const { tenantId } = get();
        if (!tenantId) return;
        try {
          const res = await axios.get(`${API_URL}/api/chats/${sessionId}`, {
            headers: { "X-Tenant-ID": tenantId }
          });
          set({ messages: res.data, currentSessionId: sessionId });
        } catch (e) {
          console.error(e);
        }
      }
    }),
    {
      name: 'repomind-storage', 
    }
  )
);
