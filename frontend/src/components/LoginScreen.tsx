"use client";

import { motion } from "framer-motion";
import { Sparkles, Terminal } from "lucide-react";
import { useChatStore } from "@/store/chatStore";

export function LoginScreen() {
  const { tenantId, setTenantId, setIsLoggedIn } = useChatStore();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tenantId.trim()) setIsLoggedIn(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 rounded-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-8 gap-3">
          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <Sparkles className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">AI-RepoMind</h1>
        </div>
        
        <p className="text-gray-400 mb-6 text-center text-sm">
          Enter your Tenant ID to securely access your indexed codebase. (Demo mode)
        </p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Tenant ID (e.g., user_123)"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-3 font-medium transition-colors shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            Access Repository <Terminal className="w-4 h-4" />
          </button>
        </form>
      </motion.div>
    </div>
  );
}
