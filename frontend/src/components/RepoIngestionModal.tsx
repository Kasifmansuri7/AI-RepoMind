"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, GitBranch, Folder, Loader2, Server } from "lucide-react";
import apiClient from "@/utils/apiClient";
import { useChatStore } from "@/store/chatStore";

export function RepoIngestionModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [isIngesting, setIsIngesting] = useState(false);
  const { session, fetchRepos } = useChatStore();

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsIngesting(true);
    setStatus("Connecting to server...");

    try {
      const res = await apiClient.post(`/api/repos/ingest`, 
        { url, token: token.trim() || undefined },
        {
          responseType: 'stream',
          adapter: 'fetch'
        }
      );

      const stream = res.data as unknown as ReadableStream<Uint8Array>;
      if (!stream) throw new Error("No response body");

      const reader = stream.getReader();
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
          
          setStatus(dataStr);
          if (eventType === "success") {
             setStatus("Ingestion complete!");
             await fetchRepos();
             setTimeout(() => {
                 onClose();
                 setStatus("");
                 setUrl("");
                 setToken("");
                 setIsIngesting(false);
             }, 1000);
             return;
          }
        }
      }
    } catch (err) {
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
              
              {status && (
                <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 text-sm">
                  {isIngesting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{status}</span>
                </div>
              )}
              
              <button
                type="submit"
                disabled={!url.trim() || isIngesting}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl px-4 py-3 font-medium transition-colors"
              >
                {isIngesting ? "Ingesting..." : "Ingest Repository"}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
