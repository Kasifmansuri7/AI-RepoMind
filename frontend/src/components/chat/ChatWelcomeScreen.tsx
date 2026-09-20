import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Database, Sparkles, RefreshCw } from "lucide-react";

export const SUGGESTION_POOL = [
  "Explain the architecture",
  "How do I get started with this repo?",
  "Find potential bugs or edge cases",
  "Suggest areas for refactoring",
  "Where is the main entry point?",
  "Identify security vulnerabilities",
  "Write a detailed README",
  "Explain the state management flow",
  "Are there any hardcoded secrets?",
  "Suggest performance optimizations",
  "Explain the database schema",
  "Find unused variables or dead code",
];

interface ChatWelcomeScreenProps {
  activeRepoName: string | undefined;
  onSendMessage: (msg: string) => void;
}

export function ChatWelcomeScreen({ activeRepoName, onSendMessage }: ChatWelcomeScreenProps) {
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);

  const refreshSuggestions = () => {
    const shuffled = [...SUGGESTION_POOL].sort(() => 0.5 - Math.random());
    setCurrentSuggestions(shuffled.slice(0, 4));
  };

  useEffect(() => {
    refreshSuggestions();
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[55vh] text-center px-4"
    >
      <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl border border-blue-500/20 flex items-center justify-center mb-6 shadow-sm">
          <Database className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">
          Welcome to {activeRepoName || "AI-RepoMind"}
        </h2>
        <p className="text-gray-400 text-base leading-relaxed mb-6">
          {activeRepoName 
            ? "I can analyze architecture, find bugs, write new features, and explain complex logic using the LangGraph agent loop."
            : "Please select a repository from the sidebar or click 'Add Repository' to get started."}
        </p>
      </div>
      
      {activeRepoName && (
        <div className="w-full flex flex-wrap justify-center items-center gap-3">
          {currentSuggestions.map((quickMsg, i) => (
            <motion.button
              key={quickMsg}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i, duration: 0.4 }}
              onClick={() => onSendMessage(quickMsg)}
              className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-sm text-gray-300 hover:text-white flex items-center gap-2 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>{quickMsg}</span>
            </motion.button>
          ))}
          
          {currentSuggestions.length > 0 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              onClick={refreshSuggestions}
              title="Show more suggestions"
              className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-gray-400 hover:text-white flex items-center justify-center shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      )}
    </motion.div>
  );
}
