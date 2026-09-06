"use client";

import { Sparkles, GitBranch, LogOut, MessageSquare } from "lucide-react";
import { useChatStore } from "@/store/chatStore";

export function Sidebar() {
  const { tenantId, repoName, logout } = useChatStore();

  return (
    <div className="w-72 glass border-r border-white/5 flex flex-col z-10">
      <div className="p-4 border-b border-white/5 flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-blue-400" />
        <span className="font-semibold text-lg tracking-wide">RepoMind</span>
      </div>
      
      <div className="p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Active Repository</p>
        <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition">
          <GitBranch className="w-5 h-5 text-gray-300" />
          <span className="text-sm font-medium">{repoName}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Chats</p>
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-gray-400 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm truncate">Fix chunker nested bug</span>
          </div>
          <div className="flex items-center gap-3 text-gray-400 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition">
            <MessageSquare className="w-4 h-4" />
            <span className="text-sm truncate">Explain Qdrant setup</span>
          </div>
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
