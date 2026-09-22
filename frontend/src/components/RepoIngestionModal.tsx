"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GitBranch, Loader2, Server, Ban, FolderGit2, Link, Search } from "lucide-react";
import apiClient from "@/utils/apiClient";
import { useChatStore } from "@/store/chatStore";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/react-query/queryKeys";

interface GithubRepo {
  id: number;
  full_name: string;
  clone_url: string;
  default_branch: string;
  private: boolean;
}

export function RepoIngestionModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"github" | "manual">("github");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([]);
  const [isFetchingGithubRepos, setIsFetchingGithubRepos] = useState(false);
  const [selectedGithubRepo, setSelectedGithubRepo] = useState<GithubRepo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const { setRepoName, session } = useChatStore();
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const providerToken = session?.provider_token as string | undefined;

  const fetchGithubRepos = useCallback(async () => {
    if (!providerToken) return;
    setIsFetchingGithubRepos(true);
    try {
      const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
        headers: {
          Authorization: `token ${providerToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setGithubRepos(data);
      }
    } catch (e) {
      console.error(e);
    }
    setIsFetchingGithubRepos(false);
  }, [providerToken]);

  useEffect(() => {
    if (isOpen && activeTab === "github" && providerToken && githubRepos.length === 0) {
      fetchGithubRepos();
    }
  }, [isOpen, activeTab, providerToken, githubRepos.length, fetchGithubRepos]);

  const handleCancel = async () => {
    setIsCancelling(true);
    setStatus("Cancelling ingestion...");

    // 1. Signal the backend to stop the pipeline
    try {
      await apiClient.post("/repos/ingest/cancel");
    } catch (e) {
      console.error("Failed to send cancel signal:", e);
    }

    // 2. Abort the frontend SSE stream
    if (readerRef.current) {
      try { await readerRef.current.cancel(); } catch {}
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setStatus("Ingestion cancelled.");
    setIsIngesting(false);
    setIsCancelling(false);
  };

  const handleFetchBranches = async (repoUrl = url, repoToken = token) => {
    if (!repoUrl.trim()) return;
    setIsFetchingBranches(true);
    setStatus("Fetching branches...");
    try {
      const res = await apiClient.post("/repos/branches", {
        url: repoUrl,
        token: repoToken.trim() || undefined
      });
      if (res.data.branches && res.data.branches.length > 0) {
        setBranches(res.data.branches);
        setSelectedBranch(res.data.branches.includes("main") ? "main" : res.data.branches[0]);
        setStatus(`Found ${res.data.branches.length} branches.`);
      } else {
        setStatus("No branches found or local repo.");
        setBranches([]);
      }
    } catch (e: unknown) {
      console.error(e);
      let errMsg = "Failed to fetch branches. Ensure it's a valid remote Git URL.";
      if (e && typeof e === 'object' && 'response' in e) {
        const responseError = e as { response?: { data?: { detail?: string } } };
        errMsg = responseError.response?.data?.detail || errMsg;
      } else if (e instanceof Error) {
        errMsg = e.message || errMsg;
      }
      setStatus(errMsg);
      setBranches([]);
    }
    setIsFetchingBranches(false);
  };

  const executeIngest = async (ingestUrl: string, ingestToken?: string, ingestBranch?: string) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsIngesting(true);
    setIsCancelling(false);
    setStatus("Connecting to server...");

    try {
      const res = await apiClient.post(`/repos/ingest`, 
        { url: ingestUrl, token: ingestToken || undefined, branch: ingestBranch || undefined },
        {
          responseType: 'stream',
          adapter: 'fetch',
          signal: abortController.signal,
        }
      );

      const stream = res.data as unknown as ReadableStream<Uint8Array>;
      if (!stream) throw new Error("No response body");

      const reader = stream.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder("utf-8");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || "";
        
        for (const part of parts) {
          if (!part.trim()) continue;
          
          const lines = part.split(/\r?\n/);
          let dataStr = "";
          let eventType = "message";
          
          for (const line of lines) {
             if (line.startsWith("event:")) eventType = line.substring(6).trim();
             if (line.startsWith("data:")) dataStr = line.substring(5).trim();
          }
          
          if (!dataStr) continue;
          
          if (eventType === "error") {
              setStatus(`Error: ${dataStr}`);
              setIsIngesting(false);
              return;
          }

          if (eventType === "cancelled") {
              setStatus("Ingestion cancelled.");
              setIsIngesting(false);
              return;
          }
          
          setStatus(dataStr);
          if (eventType === "success") {
             setStatus("Ingestion complete!");
             await queryClient.invalidateQueries({ queryKey: queryKeys.repos() });
             setRepoName(dataStr); // Automatically select the new repo!
             setTimeout(() => {
                 onClose();
                 setStatus("");
                 setUrl("");
                 setToken("");
                 setBranches([]);
                 setSelectedBranch("");
                 setSelectedGithubRepo(null);
                 setSearchQuery("");
                 setIsIngesting(false);
             }, 1000);
             return;
          }
        }
      }
    } catch (err: unknown) {
      const errorObj = err as { name?: string; code?: string };
      if (errorObj?.name === "CanceledError" || errorObj?.code === "ERR_CANCELED") {
        return;
      }
      console.error(err);
      setStatus("Failed to connect to backend.");
    }
    
    setIsIngesting(false);
  };

  const handleManualIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    await executeIngest(url, token.trim(), selectedBranch);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-lg rounded-2xl p-6 relative flex flex-col max-h-[90vh]"
          >
            <button 
              onClick={!isIngesting ? onClose : undefined} 
              className={`absolute top-4 right-4 text-gray-400 hover:text-white transition ${isIngesting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6 shrink-0">
              <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                <Server className="w-6 h-6 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold">Add Repository</h2>
            </div>
            
            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-white/5 p-1 rounded-lg shrink-0">
              <button
                onClick={() => {
                  setActiveTab("github");
                  if (activeTab !== "github") {
                    setSelectedGithubRepo(null);
                    setBranches([]);
                    setSelectedBranch("");
                    setStatus("");
                    setSearchQuery("");
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === "github" ? "bg-white/10 text-white shadow-sm" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <FolderGit2 className="w-4 h-4" /> My GitHub Repos
              </button>
              <button
                onClick={() => setActiveTab("manual")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === "manual" ? "bg-white/10 text-white shadow-sm" : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <Link className="w-4 h-4" /> Manual URL
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {activeTab === "github" && (
                <div className="space-y-4">
                  {!providerToken ? (
                    <div className="text-center p-6 bg-white/5 rounded-xl border border-white/10">
                      <FolderGit2 className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                      <h3 className="text-sm font-medium text-white mb-2">GitHub Not Connected</h3>
                      <p className="text-xs text-gray-400">
                        You need to sign in with GitHub to view your repositories directly.
                        Use the &quot;Manual URL&quot; tab instead.
                      </p>
                    </div>
                  ) : isFetchingGithubRepos ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                    </div>
                  ) : selectedGithubRepo ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 pb-2 border-b border-white/10 mb-4">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGithubRepo(null);
                            setBranches([]);
                            setSelectedBranch("");
                            setStatus("");
                          }}
                          disabled={isIngesting}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <FolderGit2 className="w-5 h-5 text-indigo-400 shrink-0" />
                          <p className="text-sm font-medium text-white truncate">{selectedGithubRepo.full_name}</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Select a branch to clone</p>
                        
                        {isFetchingBranches ? (
                          <div className="flex items-center justify-center p-8">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                          </div>
                        ) : branches.length > 0 ? (
                          <div className="grid gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                            {branches.map(b => (
                              <button
                                key={b}
                                disabled={isIngesting}
                                onClick={() => executeIngest(selectedGithubRepo.clone_url, providerToken, b)}
                                className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/30 rounded-xl p-3 transition-colors disabled:opacity-50 flex items-center justify-between group"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <GitBranch className="w-4 h-4 text-gray-500 group-hover:text-indigo-400 shrink-0" />
                                  <p className="text-sm font-medium text-white truncate">{b}</p>
                                </div>
                                {b === selectedGithubRepo.default_branch && (
                                  <span className="text-xs bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-md ml-3 shrink-0">
                                    Default
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-center text-sm text-gray-400 p-4">No branches found.</p>
                        )}
                      </div>

                      {isIngesting && (
                        <div className="pt-2 flex gap-3">
                          <button
                            type="button"
                            disabled={true}
                            className="flex-1 bg-indigo-600/50 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 opacity-70 cursor-not-allowed"
                          >
                            <Loader2 className="w-4 h-4 animate-spin" /> Ingesting...
                          </button>
                          <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isCancelling}
                            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl px-5 py-3 font-medium transition-colors flex items-center gap-2"
                          >
                            <Ban className="w-4 h-4" /> Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ) : githubRepos.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Select a repository to index</p>
                      </div>
                      
                      <div className="relative">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search repositories..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                        />
                        <Search className="absolute left-3.5 top-3 w-4 h-4 text-gray-500" />
                      </div>

                      <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {githubRepos.filter(repo => repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
                          githubRepos
                            .filter(repo => repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(repo => (
                              <button
                                key={repo.id}
                                disabled={isIngesting}
                                onClick={() => {
                                  setSelectedGithubRepo(repo);
                                  handleFetchBranches(repo.clone_url, providerToken);
                                }}
                                className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/30 rounded-xl p-3 transition-colors disabled:opacity-50 flex items-center justify-between group"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-white truncate">{repo.full_name}</p>
                                  <p className="text-xs text-gray-400 truncate mt-0.5">{repo.private ? "Private" : "Public"} • {repo.default_branch}</p>
                                </div>
                                <GitBranch className="w-4 h-4 text-gray-500 group-hover:text-indigo-400 shrink-0 ml-3" />
                              </button>
                            ))
                        ) : (
                          <p className="text-center text-sm text-gray-400 py-4">No matching repositories found.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-sm text-gray-400 p-4">No repositories found.</p>
                  )}
                </div>
              )}

              {activeTab === "manual" && (
                <form onSubmit={handleManualIngest} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">GitHub URL or Local Path</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={isIngesting}
                        placeholder="https://github.com/user/repo"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                      />
                      <GitBranch className="absolute left-4 top-3.5 w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">GitHub Access Token (Optional, for private repos)</label>
                    <div className="relative">
                      <input
                        type="password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        disabled={isIngesting}
                        placeholder="ghp_xxxxxxxxxxxx"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-colors"
                      />
                    </div>
                  </div>
                  
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-400 mb-2">Branch (Optional)</label>
                      <div className="relative">
                        <select
                          value={selectedBranch}
                          onChange={(e) => setSelectedBranch(e.target.value)}
                          disabled={isIngesting || branches.length === 0}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 transition-colors disabled:text-gray-500 disabled:cursor-not-allowed appearance-none"
                        >
                          {branches.length > 0 ? (
                            branches.map(b => (
                              <option key={b} value={b} className="bg-zinc-900 text-white">{b}</option>
                            ))
                          ) : (
                            <option value="" disabled className="bg-zinc-900 text-gray-500">
                              {isFetchingBranches ? "Fetching branches..." : "Fetch branches to select"}
                            </option>
                          )}
                        </select>
                        <div className="absolute right-4 top-4 pointer-events-none text-gray-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFetchBranches(url, token)}
                      disabled={!url.trim() || isFetchingBranches || isIngesting}
                      className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50 disabled:hover:bg-indigo-500/10 rounded-xl px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      {isFetchingBranches ? "Fetching..." : "Fetch Branches"}
                    </button>
                  </div>

                  <div className="pt-2">
                    {isIngesting ? (
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={true}
                          className="flex-1 bg-indigo-600/50 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 opacity-70 cursor-not-allowed"
                        >
                          <Loader2 className="w-4 h-4 animate-spin" /> Ingesting...
                        </button>
                        <button
                          type="button"
                          onClick={handleCancel}
                          disabled={isCancelling}
                          className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl px-5 py-3 font-medium transition-colors flex items-center gap-2"
                        >
                          <Ban className="w-4 h-4" /> Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        disabled={!url.trim()}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-medium transition-colors"
                      >
                        Ingest Repository
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>

            {/* Status display applies to both tabs */}
            {status && (
              <div className={`mt-4 flex items-center gap-3 p-3 rounded-xl text-sm shrink-0 ${
                status.startsWith("Error") || status === "Ingestion cancelled."
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : status === "Ingestion complete!"
                  ? "bg-green-500/10 border border-green-500/20 text-green-400"
                  : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
              }`}>
                {isIngesting && !isCancelling && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                {isCancelling && <Ban className="w-4 h-4 animate-pulse shrink-0" />}
                <span className="truncate">{status}</span>
              </div>
            )}
            
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
