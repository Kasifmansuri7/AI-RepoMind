import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import apiClient from '@/utils/apiClient';
import { supabase } from '@/utils/supabase/client';
import { Session } from '@supabase/supabase-js';

export type Message = { id?: string, role: "user" | "assistant", content: string, created_at?: string };
export type Repo = { id: string, name: string, url: string };
export type ChatSession = { id: string, repo_id: string, title?: string, created_at: string, parent_session_id?: string };

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
  
  sessionsPage: number;
  hasMoreSessions: boolean;
  chatSearchQuery: string;
  messagesPage: number;
  hasMoreMessages: boolean;
  
  isReposLoading: boolean;
  isSessionsLoading: boolean;
  isMessagesLoading: boolean;
  
  initializeAuth: () => void;
  logout: () => Promise<void>;
  
  setRepoName: (name: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  setChatSearchQuery: (query: string) => void;
  addMessage: (msg: Message) => void;
  startNewChat: () => void;
  
  fetchRepos: () => Promise<void>;
  deleteRepo: (repoId: string) => Promise<boolean>;
  fetchSessions: (page?: number, repoFilter?: string) => Promise<void>;
  fetchMessages: (sessionId: string, page?: number) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  updateLastMessage: (content: string) => void;
  forkChat: (sessionId: string, messageId: string) => Promise<string>;
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
      sessionsPage: 1,
      hasMoreSessions: false,
      chatSearchQuery: "",
      messagesPage: 1,
      hasMoreMessages: false,
      currentSessionId: null,
      
      isReposLoading: false,
      isSessionsLoading: false,
      isMessagesLoading: false,
      
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
      setChatSearchQuery: (query) => set({ chatSearchQuery: query }),
      startNewChat: () => set({ 
        currentSessionId: null, 
        messages: [], 
        messagesPage: 1, 
        hasMoreMessages: false 
      }),
      addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
      updateLastMessage: (content) => set((state) => {
        const msgs = [...state.messages];
        if (msgs.length > 0) {
          msgs[msgs.length - 1].content = content;
        }
        return { messages: msgs };
      }),
      
      fetchRepos: async () => {
        const { session } = get();
        if (!session) return;
        set({ isReposLoading: true });
        try {
          const res = await apiClient.get('/api/repos');
          const data = res.data;
          set({ repos: data });
          if (data.length > 0 && !get().repoName) {
            set({ repoName: data[0].name });
          }
        } catch (e) {
          console.error(e);
        } finally {
          set({ isReposLoading: false });
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
      
      fetchSessions: async (page = 1, repoFilter = "all") => {
        const { session, chatSearchQuery, tenantId } = get();
        if (!session) return;
        
        // Only set loading for initial fetch, not pagination
        if (page === 1) set({ isSessionsLoading: true });
        
        try {
          const params = new URLSearchParams({ page: page.toString(), limit: "20" });
          if (chatSearchQuery) params.append("search", chatSearchQuery);
          if (repoFilter !== "all") params.append("repo_id", `${tenantId}_${repoFilter}`);
          
          const res = await apiClient.get(`/api/chats?${params.toString()}`);
          set((state) => ({ 
            sessions: page === 1 ? res.data.items : [...state.sessions, ...res.data.items],
            sessionsPage: page,
            hasMoreSessions: res.data.has_more
          }));
        } catch (e) {
          console.error(e);
        } finally {
          if (page === 1) set({ isSessionsLoading: false });
        }
      },
      
      fetchMessages: async (sessionId: string, page = 1) => {
        const { session } = get();
        if (!session) return;
        
        if (page === 1) set({ isMessagesLoading: true });
        
        try {
          const params = new URLSearchParams({ page: page.toString(), limit: "50" });
          const res = await apiClient.get(`/api/chats/${sessionId}?${params.toString()}`);
          set((state) => ({ 
            messages: page === 1 ? res.data.items : [...res.data.items, ...state.messages], 
            currentSessionId: sessionId,
            messagesPage: page,
            hasMoreMessages: res.data.has_more
          }));
        } catch (e) {
          console.error(e);
        } finally {
          if (page === 1) set({ isMessagesLoading: false });
        }
      },
      
      deleteSession: async (sessionId: string) => {
        const { session, sessions, currentSessionId } = get();
        if (!session) return false;
        try {
          await apiClient.delete(`/api/chats/${sessionId}`);
          
          const remainingSessions = sessions.filter(s => s.id !== sessionId);
          set({ sessions: remainingSessions });
          
          if (currentSessionId === sessionId || !remainingSessions.some(s => s.id === currentSessionId)) {
            set({ messages: [], currentSessionId: null });
          }
          
          return true;
        } catch (e) {
          console.error("Failed to delete chat session:", e);
          throw e;
        }
      },
      
      forkChat: async (sessionId: string, messageId: string) => {
        const { session } = get();
        if (!session) return "";
        try {
          const res = await apiClient.post(`/api/chats/${sessionId}/fork`, { message_id: messageId });
          const newSessionId = res.data.new_session_id;
          
          // Switch to new session
          set({ currentSessionId: newSessionId, messages: [], messagesPage: 1, hasMoreMessages: false });
          
          // Refresh sessions and messages
          await get().fetchSessions(1);
          await get().fetchMessages(newSessionId, 1);
          
          return newSessionId;
        } catch (e) {
          console.error("Failed to fork chat:", e);
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
