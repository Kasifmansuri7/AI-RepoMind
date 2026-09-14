"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabase/client";

export function LoginScreen() {
  const [loadingProvider, setLoadingProvider] = useState<'github' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 rounded-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-center mb-8 gap-3">
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <Sparkles className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">AI-RepoMind</h1>
        </div>
        
        <p className="text-gray-400 mb-8 text-center text-sm">
          Welcome to RepoMind. Sign in to your account to get started.
        </p>
        
        {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}

        <div className="space-y-3">
          <button
            onClick={async () => {
              setLoadingProvider('github');
              try {
                await supabase.auth.signInWithOAuth({
                  provider: 'github',
                  options: {
                    scopes: 'repo',
                  }
                });
              } catch (err: unknown) {
                if (err instanceof Error) {
                  setError(err.message || "Failed to authenticate with GitHub.");
                } else {
                  setError("Failed to authenticate with GitHub.");
                }
                setLoadingProvider(null);
              }
            }}
            disabled={loadingProvider !== null}
            className="w-full bg-[#24292e] text-white hover:bg-[#2f363d] disabled:opacity-50 rounded-xl px-4 py-3 font-medium transition-colors border border-white/10 flex items-center justify-center gap-3"
          >
            {loadingProvider === 'github' ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
                Continue with GitHub
              </>
            )}
          </button>

          <button
            onClick={async () => {
              setLoadingProvider('google');
              try {
                await supabase.auth.signInWithOAuth({
                  provider: 'google',
                });
              } catch (err: unknown) {
                if (err instanceof Error) {
                  setError(err.message || "Failed to authenticate with Google.");
                } else {
                  setError("Failed to authenticate with Google.");
                }
                setLoadingProvider(null);
              }
            }}
            disabled={loadingProvider !== null}
            className="w-full bg-white text-black hover:bg-gray-100 disabled:opacity-50 rounded-xl px-4 py-3 font-medium transition-colors border border-white/10 flex items-center justify-center gap-3"
          >
            {loadingProvider === 'google' ? <Loader2 className="w-5 h-5 animate-spin text-black" /> : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  <path d="M1 1h22v22H1z" fill="none"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
