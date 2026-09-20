import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  repoName: string;
  currentSessionId: string | null;
  chatSearchQuery: string;
  isSidebarOpen: boolean;
  mode: "auto" | "ask" | "plan";
  
  initializeAuth: () => void;
  logout: () => Promise<void>;
  
  setRepoName: (name: string) => void;
  setCurrentSessionId: (id: string | null) => void;
  setChatSearchQuery: (query: string) => void;
  startNewChat: () => void;
  toggleSidebar: () => void;
  setMode: (mode: "auto" | "ask" | "plan") => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      tenantId: "",
      isLoggedIn: false,
      isAuthLoading: true,
      session: null,
      repoName: "",
      currentSessionId: null,
      chatSearchQuery: "",
      isSidebarOpen: true,
      mode: "auto",
      
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
          if (!session) {
             set({ repoName: "", currentSessionId: null });
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
        currentSessionId: null 
      }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'repomind-storage', 
      partialize: (state) => ({ repoName: state.repoName, currentSessionId: state.currentSessionId, isSidebarOpen: state.isSidebarOpen, mode: state.mode }),
    }
  )
);
