import { motion, AnimatePresence } from "framer-motion";
import { Brain, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import apiClient from "@/utils/apiClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/react-query/queryKeys";

const FALLBACK_SUGGESTIONS = [
  "Explain the architecture",
  "How do I get started with this repo?",
  "Find potential bugs or edge cases",
  "Suggest areas for refactoring",
];

interface ChatWelcomeScreenProps {
  activeRepoName: string | undefined;
  onSendMessage: (msg: string) => void;
}

export function ChatWelcomeScreen({ activeRepoName, onSendMessage }: ChatWelcomeScreenProps) {
  const queryClient = useQueryClient();

  const { data: currentSuggestions = FALLBACK_SUGGESTIONS, isLoading, isFetching } = useQuery<string[]>({
    queryKey: activeRepoName ? queryKeys.suggestions(activeRepoName) : [],
    queryFn: async () => {
      const res = await apiClient.get(`/repos/${encodeURIComponent(activeRepoName!)}/suggestions`);
      return res.data?.suggestions || FALLBACK_SUGGESTIONS;
    },
    enabled: !!activeRepoName,
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: false,
  });

  const handleRefresh = async () => {
    if (!activeRepoName) return;
    // We update the cache directly after forcing a refresh so the UI updates instantly
    try {
      const res = await apiClient.get(`/repos/${encodeURIComponent(activeRepoName)}/suggestions?force_refresh=true`);
      if (res.data?.suggestions) {
        queryClient.setQueryData(queryKeys.suggestions(activeRepoName), res.data.suggestions);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const loading = isLoading || isFetching;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[55vh] text-center px-4"
    >
      <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto">
        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl border border-blue-500/20 flex items-center justify-center mb-6 shadow-sm">
          <Brain className="w-8 h-8 text-blue-400" />
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
        <div className="w-full flex flex-wrap justify-center items-center gap-3 min-h-[44px]">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex items-center text-gray-400 gap-2"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Generating suggestions...</span>
              </motion.div>
            ) : (
              <motion.div
                key="suggestions"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full flex flex-wrap justify-center items-center gap-3"
              >
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
                    onClick={handleRefresh}
                    title="Generate new suggestions"
                    className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-gray-400 hover:text-white flex items-center justify-center shadow-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </motion.button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
