"use client";

import { useEffect } from "react";
import { Sparkles, GitBranch, LogOut, MessageSquare, Plus } from "lucide-react";
import { useChatStore } from "@/store/chatStore";

export function Sidebar({ onOpenIngest }: { onOpenIngest: () => void }) {
  const { tenantId, repos, repoName, setRepoName, sessions, fetchRepos, fetchSessions, fetchMessages, logout } = useChatStore();

  useEffect(() => {
    fetchRepos();
    fetchSessions();
  }, [fetchRepos, fetchSessions]);

  return (
    <div className="w-72 glass border-r border-white/5 flex flex-col z-10">
      <div className="p-4 border-b border-white/5 flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-blue-400" />
        <span className="font-semibold text-lg tracking-wide">RepoMind</span>
      </div>
      
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Repository</p>
            <button onClick={onOpenIngest} className="text-blue-400 hover:text-blue-300 transition">
                <Plus className="w-4 h-4" />
            </button>
        </div>
        
        {repos.length > 0 ? (
            <select
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm font-medium text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {repos.map((r) => (
                <option key={r.id} value={r.name} className="bg-gray-900">{r.name}</option>
              ))}
            </select>
        ) : (
            <button onClick={onOpenIngest} className="w-full flex items-center justify-center gap-2 bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-xl p-3 text-sm hover:bg-blue-600/30 transition">
               <Plus className="w-4 h-4" /> Add your first repo
            </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Chats</p>
        <div className="space-y-2">
          {sessions.length > 0 ? sessions.map((s) => (
             <div 
               key={s.id} 
               onClick={() => fetchMessages(s.id)}
               className="flex items-center gap-3 text-gray-400 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition"
             >
               <MessageSquare className="w-4 h-4 shrink-0" />
               <div className="flex flex-col overflow-hidden">
                   <span className="text-sm truncate">Chat ({s.repo_id.split('_')[1]})</span>
                   <span className="text-[10px] text-gray-600 truncate">{new Date(s.created_at).toLocaleDateString()}</span>
               </div>
             </div>
          )) : (
             <p className="text-xs text-gray-600 text-center mt-4">No recent chats</p>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-sm font-bold">
            {tenantId.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-gray-300 truncate max-w-[100px]">{tenantId}</span>
        </div>
        <button onClick={logout} className="text-gray-500 hover:text-white transition">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
