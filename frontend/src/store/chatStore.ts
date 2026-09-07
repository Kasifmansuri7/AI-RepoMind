import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import { supabase } from '@/utils/supabase/client';
import { Session } from '@supabase/supabase-js';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Message = { role: "user" | "assistant", content: string };
export type Repo = { id: string, name: string, url: string };
export type ChatSession = { id: string, repo_id: string, created_at: string };

interface ChatState {
  tenantId: string;
  isLoggedIn: boolean;
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
  fetchSessions: () => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      tenantId: "",
      isLoggedIn: false,
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
            tenantId: session?.user.id || "" 
          });
        });

        supabase.auth.onAuthStateChange((_event, session) => {
          set({ 
            session, 
            isLoggedIn: !!session,
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
          const res = await axios.get(`${API_URL}/api/repos`, {
            headers: { "Authorization": `Bearer ${session.access_token}` }
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
        const { session } = get();
        if (!session) return;
        try {
          const res = await axios.get(`${API_URL}/api/chats`, {
            headers: { "Authorization": `Bearer ${session.access_token}` }
          });
          set({ sessions: res.data });
        } catch (e) {
          console.error(e);
        }
      },
      
      fetchMessages: async (sessionId: string) => {
        const { session } = get();
        if (!session) return;
        try {
          const res = await axios.get(`${API_URL}/api/chats/${sessionId}`, {
            headers: { "Authorization": `Bearer ${session.access_token}` }
          });
          set({ messages: res.data, currentSessionId: sessionId });
        } catch (e) {
          console.error(e);
        }
      }
    }),
    {
      name: 'repomind-storage', 
      partialize: (state) => ({ repoName: state.repoName, currentSessionId: state.currentSessionId }),
    }
  )
);
