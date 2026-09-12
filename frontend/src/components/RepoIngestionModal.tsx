"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GitBranch, Folder, Loader2, Server, Ban } from "lucide-react";
import apiClient from "@/utils/apiClient";
import { useChatStore } from "@/store/chatStore";

export function RepoIngestionModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [isFetchingBranches, setIsFetchingBranches] = useState(false);
  const { session, fetchRepos, setRepoName } = useChatStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const handleCancel = async () => {
    setIsCancelling(true);
    setStatus("Cancelling ingestion...");

    // 1. Signal the backend to stop the pipeline
    try {
      await apiClient.post("/api/repos/ingest/cancel");
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

  const handleFetchBranches = async () => {
    if (!url.trim()) return;
    setIsFetchingBranches(true);
    setStatus("Fetching branches...");
    try {
      const res = await apiClient.post("/api/repos/branches", {
        url,
        token: token.trim() || undefined
      });
      if (res.data.branches && res.data.branches.length > 0) {
        setBranches(res.data.branches);
        setSelectedBranch(res.data.branches.includes("main") ? "main" : res.data.branches[0]);
        setStatus(`Found ${res.data.branches.length} branches.`);
      } else {
        setStatus("No branches found or local repo.");
        setBranches([]);
      }
    } catch (e: any) {
      console.error(e);
      const errMsg = e.response?.data?.detail || "Failed to fetch branches. Ensure it's a valid remote Git URL.";
      setStatus(errMsg);
      setBranches([]);
    }
    setIsFetchingBranches(false);
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsIngesting(true);
    setIsCancelling(false);
    setStatus("Connecting to server...");

    try {
      const res = await apiClient.post(`/api/repos/ingest`, 
        { url, token: token.trim() || undefined, branch: selectedBranch || undefined },
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
             await fetchRepos();
             setRepoName(dataStr); // Automatically select the new repo!
             setTimeout(() => {
                 onClose();
                 setStatus("");
                 setUrl("");
                 setToken("");
                 setBranches([]);
                 setSelectedBranch("");
                 setIsIngesting(false);
             }, 1000);
             return;
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
        // User-initiated cancel, don't show error
        return;
      }
      console.error(err);
      setStatus("Failed to connect to backend.");
    }
    
    setIsIngesting(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-lg rounded-2xl p-6 relative"
          >
            <button 
              onClick={!isIngesting ? onClose : undefined} 
              className={`absolute top-4 right-4 text-gray-400 hover:text-white transition ${isIngesting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <Server className="w-6 h-6 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold">Add Repository</h2>
            </div>
            
            <form onSubmit={handleIngest} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">GitHub URL or Local Path</label>
                <div className="relative">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isIngesting}
                    placeholder="https://github.com/user/repo"
                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                  <GitBranch className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
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
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>
              </div>
              
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-2">Branch (Optional)</label>
                  <div className="relative">
                    {branches.length > 0 ? (
                      <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        disabled={isIngesting}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      >
                        {branches.map(b => (
                          <option key={b} value={b} className="bg-zinc-900 text-white">{b}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        disabled={isIngesting}
                        placeholder="e.g. main or dev"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                      />
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleFetchBranches}
                  disabled={!url.trim() || isFetchingBranches || isIngesting}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-medium transition-colors whitespace-nowrap"
                >
                  {isFetchingBranches ? "Fetching..." : "Fetch Branches"}
                </button>
              </div>
              
              {status && (
                <div className={`flex items-center gap-3 p-3 rounded-xl text-sm ${
                  status.startsWith("Error") || status === "Ingestion cancelled."
                    ? "bg-red-500/10 border border-red-500/20 text-red-400"
                    : status === "Ingestion complete!"
                    ? "bg-green-500/10 border border-green-500/20 text-green-400"
                    : "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                }`}>
                  {isIngesting && !isCancelling && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  {isCancelling && <Ban className="w-4 h-4 animate-pulse shrink-0" />}
                  <span>{status}</span>
                </div>
              )}
              
              <div className="flex gap-3">
                {isIngesting ? (
                  <>
                    <button
                      type="button"
                      disabled={true}
                      className="flex-1 bg-blue-600/50 text-white rounded-xl px-4 py-3 font-medium flex items-center justify-center gap-2 opacity-70 cursor-not-allowed"
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
                  </>
                ) : (
                  <button
                    type="submit"
                    disabled={!url.trim()}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-medium transition-colors"
                  >
                    Ingest Repository
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
