"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  GitBranch, 
  LogOut, 
  MessageSquare, 
  Plus, 
  ChevronDown, 
  Check, 
  Trash2,
  FolderGit2,
  Search
} from "lucide-react";
import { useChatStore, Repo, ChatSession } from "@/store/chatStore";
import { DeleteRepoModal } from "@/components/DeleteRepoModal";
import { DeleteChatModal } from "@/components/DeleteChatModal";
import { Skeleton } from "@/components/Skeleton";

export function Sidebar({ onOpenIngest }: { onOpenIngest: () => void }) {
  const { 
    tenantId,
    session,
    repos, 
    repoName, 
    setRepoName, 
    sessions, 
    fetchRepos, 
    fetchSessions, 
    fetchMessages, 
    currentSessionId,
    logout,
    chatSearchQuery,
    setChatSearchQuery,
    sessionsPage,
    hasMoreSessions,
    isReposLoading,
    isSessionsLoading,
    startNewChat
  } = useChatStore();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isChatFilterDropdownOpen, setIsChatFilterDropdownOpen] = useState(false);
  const [repoToDelete, setRepoToDelete] = useState<Repo | null>(null);
  const [chatToDelete, setChatToDelete] = useState<ChatSession | null>(null);
  const [chatFilterRepo, setChatFilterRepo] = useState<string>("all");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const chatFilterDropdownRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  
  const [localSearch, setLocalSearch] = useState(chatSearchQuery);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  useEffect(() => {
    fetchSessions(1, chatFilterRepo);
  }, [fetchSessions, chatSearchQuery, chatFilterRepo]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setChatSearchQuery(localSearch);
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [localSearch, setChatSearchQuery]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreSessions) {
          fetchSessions(sessionsPage + 1, chatFilterRepo);
        }
      },
      { threshold: 1.0 }
    );
    if (observerRef.current) observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMoreSessions, sessionsPage, fetchSessions, chatFilterRepo]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (chatFilterDropdownRef.current && !chatFilterDropdownRef.current.contains(event.target as Node)) {
        setIsChatFilterDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeRepo = repos.find((r) => r.name === repoName) || (repos.length > 0 ? repos[0] : null);

  const avatarUrl = session?.user?.user_metadata?.avatar_url;
  const displayName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || tenantId;

  return (
    <>
      <div className="w-72 glass border-r border-white/5 flex flex-col z-10 select-none">
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-blue-400" />
          <span className="font-semibold text-lg tracking-wide text-white">RepoMind</span>
        </div>
        
        {/* Active Repository Section */}
        <div className="p-4 relative" ref={dropdownRef}>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active Repository</p>
            <button 
              onClick={onOpenIngest} 
              title="Add Repository"
              className="p-1 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          {repos.length > 0 ? (
            <div className="relative">
              {/* Custom Styled Dropdown Trigger Button */}
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`w-full bg-white/[0.02] hover:bg-white/[0.04] border ${
                  isDropdownOpen ? "border-indigo-500/40" : "border-white/5 hover:border-white/10"
                } rounded-xl px-3.5 py-2.5 text-left transition-colors flex items-center justify-between group`}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-gray-100 truncate">
                      {activeRepo ? activeRepo.name : "Select repository"}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate">
                      {repos.length} {repos.length === 1 ? "repository" : "repositories"}
                    </span>
                  </div>
                </div>
                <ChevronDown 
                  className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${
                    isDropdownOpen ? "rotate-180 text-blue-400" : "group-hover:text-gray-300"
                  }`} 
                />
              </button>

              {/* Animated Custom Glassmorphism Dropdown Menu */}
              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute top-full left-0 right-0 mt-2 z-40 rounded-xl glass-card p-1.5 border border-white/10 shadow-2xl backdrop-blur-xl bg-zinc-950/95 max-h-64 overflow-y-auto"
                  >
                    <div className="space-y-1">
                      {repos.map((r) => {
                        const isSelected = r.name === (activeRepo?.name || repoName);
                        return (
                          <div
                            key={r.id}
                            onClick={() => {
                              setRepoName(r.name);
                              setIsDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition group ${
                              isSelected
                                ? "bg-blue-600/15 text-blue-300 border border-blue-500/20"
                                : "hover:bg-white/5 text-gray-300 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <FolderGit2 className={`w-4 h-4 shrink-0 ${isSelected ? "text-blue-400" : "text-gray-500 group-hover:text-gray-300"}`} />
                              <span className="text-sm font-medium truncate">{r.name}</span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-blue-400" />
                              )}
                              <button
                                type="button"
                                title={`Delete ${r.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsDropdownOpen(false);
                                  setRepoToDelete(r);
                                }}
                                className="p-1 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/20 transition opacity-60 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t border-white/5 my-1.5 pt-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          onOpenIngest();
                        }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg text-xs font-medium text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add new repository</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : isReposLoading ? (
             <Skeleton className="w-full h-12 rounded-xl" />
          ) : (
            <button 
              onClick={onOpenIngest} 
              className="w-full flex items-center justify-center gap-2 bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-xl p-3 text-sm hover:bg-blue-600/30 transition font-medium"
            >
              <Plus className="w-4 h-4" /> Add your first repo
            </button>
          )}
        </div>

        {/* Recent Chats Section */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">

          <div className="flex items-center justify-between mb-3 relative" ref={chatFilterDropdownRef}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recent Chats</p>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsChatFilterDropdownOpen(!isChatFilterDropdownOpen)}
                className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-2 py-1 text-[10px] text-gray-300 transition-colors shadow-sm"
              >
                <span className="max-w-[80px] truncate">
                  {chatFilterRepo === "all" ? "All Repos" : chatFilterRepo}
                </span>
                <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${isChatFilterDropdownOpen ? "rotate-180 text-blue-400" : ""}`} />
              </button>

              <button 
                onClick={startNewChat} 
                title="New Chat"
                className="p-1 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <AnimatePresence>
              {isChatFilterDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute top-full right-0 mt-1.5 w-40 z-40 rounded-xl glass-card p-1.5 border border-white/10 shadow-xl backdrop-blur-xl bg-zinc-950/95 max-h-48 overflow-y-auto"
                >
                  <div className="space-y-0.5">
                    <button
                      onClick={() => {
                        setChatFilterRepo("all");
                        setIsChatFilterDropdownOpen(false);
                      }}
                      className={`w-full text-left flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        chatFilterRepo === "all" ? "bg-blue-500/20 text-blue-300" : "text-gray-300 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="truncate">All Repos</span>
                      {chatFilterRepo === "all" && <Check className="w-3 h-3 text-blue-400" />}
                    </button>
                    
                    {repos.map(r => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setChatFilterRepo(r.name);
                          setIsChatFilterDropdownOpen(false);
                        }}
                        className={`w-full text-left flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                          chatFilterRepo === r.name ? "bg-blue-500/20 text-blue-300" : "text-gray-300 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{r.name}</span>
                        {chatFilterRepo === r.name && <Check className="w-3 h-3 text-blue-400" />}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search chats..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>


          <div className="space-y-2">
            {isSessionsLoading && sessions.length === 0 ? (
               <div className="py-2 flex flex-col gap-2">
                 <Skeleton className="h-12 w-full rounded-lg" />
                 <Skeleton className="h-12 w-full rounded-lg opacity-80" />
                 <Skeleton className="h-12 w-full rounded-lg opacity-60" />
                 <Skeleton className="h-12 w-full rounded-lg opacity-40" />
               </div>
            ) : sessions.length > 0 ? (
              sessions.map((s) => (
                  <div 
                    key={s.id} 
                    onClick={() => fetchMessages(s.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors group ${
                      currentSessionId === s.id ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden min-w-0 pr-2">
                      <MessageSquare className={`w-4 h-4 shrink-0 transition-colors ${currentSessionId === s.id ? "text-blue-400" : "text-gray-500 group-hover:text-blue-400"}`} />
                      <div className="flex flex-col overflow-hidden min-w-0 gap-0.5">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className={`text-sm truncate transition-colors ${currentSessionId === s.id ? "text-white" : "text-gray-300 group-hover:text-white"}`}>
                            {s.title || 'New Chat'}
                          </span>
                          <span className="px-1 py-0.5 rounded text-[9px] font-medium bg-white/5 text-gray-400 border border-white/10 shrink-0 truncate max-w-[80px]">
                            {s.repo_id.split('_').slice(1).join('_') || s.repo_id}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-600 truncate">{new Date(s.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      title="Delete Chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        setChatToDelete(s);
                      }}
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/20 transition opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-600 text-center mt-4">No recent chats</p>
              )}
              {(hasMoreSessions || (isSessionsLoading && sessions.length > 0)) && (
                <div ref={observerRef} className="py-2 flex flex-col gap-2">
                  <Skeleton className="h-12 w-full rounded-lg" />
                  <Skeleton className="h-12 w-full rounded-lg opacity-70" />
                </div>
              )}
          </div>
        </div>

        {/* User Profile / Logout Section */}
        <div className="p-4 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover shrink-0 shadow-sm" />
            ) : (
              <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm text-gray-300 truncate max-w-[110px]" title={displayName}>
              {displayName}
            </span>
          </div>
          <button 
            onClick={logout} 
            title="Log out"
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Repository Deletion Confirmation Modal */}
      <DeleteRepoModal
        isOpen={!!repoToDelete}
        repo={repoToDelete}
        onClose={() => setRepoToDelete(null)}
      />

      {/* Chat Deletion Confirmation Modal */}
      <DeleteChatModal
        isOpen={!!chatToDelete}
        chat={chatToDelete}
        onClose={() => setChatToDelete(null)}
      />
    </>
  );
}
