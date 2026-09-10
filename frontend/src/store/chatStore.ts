import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/utils/apiClient';
import { supabase } from '@/utils/supabase/client';
import { Session } from '@supabase/supabase-js';

export type Message = { role: "user" | "assistant", content: string };
export type Repo = { id: string, name: string, url: string };
export type ChatSession = { id: string, repo_id: string, created_at: string };

interface ChatState {
  tenantId: string;
  isLoggedIn: boolean;
  isAuthLoading: boolean;
  session: Session | null;
  messages: Message[];
  repoName: string;
  repos: Repo[];
  sessions: ChatSession[];
  currentSessionId: string | null;
  
  initializeAuth: () => void;
  logout: () => Promise<void>;
  
  setRepoName: (name: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  addMessage: (msg: Message) => void;
  
  fetchRepos: () => Promise<void>;
  deleteRepo: (repoId: string) => Promise<boolean>;
  fetchSessions: () => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      tenantId: "",
      isLoggedIn: false,
      isAuthLoading: true,
      session: null,
      messages: [],
      repoName: "",
      repos: [],
      sessions: [],
      currentSessionId: null,
      
      initializeAuth: () => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          set({ 
            session, 
            isLoggedIn: !!session,
            isAuthLoading: false,
            tenantId: session?.user.id || "" 
          });
        });

        supabase.auth.onAuthStateChange((_event, session) => {
          set({ 
            session, 
            isLoggedIn: !!session,
            isAuthLoading: false,
            tenantId: session?.user.id || ""
          });
          if (session) {
             get().fetchRepos();
             get().fetchSessions();
          } else {
             set({ messages: [], repos: [], sessions: [], repoName: "", currentSessionId: null });
          }
        });
      },

      logout: async () => {
        await supabase.auth.signOut();
      },

      setRepoName: (name) => set({ repoName: name }),
      setCurrentSessionId: (id) => set({ currentSessionId: id }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      
      fetchRepos: async () => {
        const { session } = get();
        if (!session) return;
        try {
          const res = await apiClient.get('/api/repos');
          const data = res.data;
          set({ repos: data });
          if (data.length > 0 && !get().repoName) {
            set({ repoName: data[0].name });
          }
        } catch (e) {
          console.error(e);
        }
      },

      deleteRepo: async (repoId: string) => {
        const { session, repos, repoName } = get();
        if (!session) return false;
        try {
          await apiClient.delete(`/api/repos/${encodeURIComponent(repoId)}`);
          
          const remainingRepos = repos.filter(r => r.id !== repoId && r.name !== repoId);
          set({ repos: remainingRepos });
          
          const targetRepo = repos.find(r => r.id === repoId || r.name === repoId);
          if (targetRepo && targetRepo.name === repoName) {
            const nextRepo = remainingRepos.length > 0 ? remainingRepos[0].name : "";
            set({ repoName: nextRepo, messages: [], currentSessionId: null });
          }
          
          await get().fetchSessions();
          return true;
        } catch (e) {
          console.error("Failed to delete repo:", e);
          throw e;
        }
      },
      
      fetchSessions: async () => {
        const { session } = get();
        if (!session) return;
        try {
          const res = await apiClient.get('/api/chats');
          set({ sessions: res.data });
        } catch (e) {
          console.error(e);
        }
      },
      
      fetchMessages: async (sessionId: string) => {
        const { session } = get();
        if (!session) return;
        try {
          const res = await apiClient.get(`/api/chats/${sessionId}`);
          set({ messages: res.data, currentSessionId: sessionId });
        } catch (e) {
          console.error(e);
        }
      },
      
      deleteSession: async (sessionId: string) => {
        const { session, sessions, currentSessionId } = get();
        if (!session) return false;
        try {
          await apiClient.delete(`/api/chats/${sessionId}`);
          
          const remainingSessions = sessions.filter(s => s.id !== sessionId);
          set({ sessions: remainingSessions });
          
          if (currentSessionId === sessionId) {
            set({ messages: [], currentSessionId: null });
          }
          
          return true;
        } catch (e) {
          console.error("Failed to delete chat session:", e);
          throw e;
        }
      }
    }),
    {
      name: 'repomind-storage', 
      partialize: (state) => ({ repoName: state.repoName, currentSessionId: state.currentSessionId }),
    }
  )
);
