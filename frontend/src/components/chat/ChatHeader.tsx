import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Database } from "lucide-react";

interface ChatHeaderProps {
  hasMessages: boolean;
  currentSessionTitle: string | undefined;
  activeRepoName: string | undefined;
}

export function ChatHeader({ hasMessages, currentSessionTitle, activeRepoName }: ChatHeaderProps) {
  return (
    <AnimatePresence>
      {hasMessages && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 mb-8 pb-4 border-b border-white/10"
        >
          <MessageSquare className="w-5 h-5 text-blue-400" />
          <AnimatePresence mode="wait">
            <motion.h2 
              key={currentSessionTitle || 'New Chat'}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.2 }}
              className="text-xl font-bold"
            >
              {currentSessionTitle || 'New Chat'}
            </motion.h2>
          </AnimatePresence>
          <span className="px-2 py-1 bg-white/5 rounded-md text-xs text-gray-400 ml-auto border border-white/5 flex items-center gap-1">
            <Database className="w-3 h-3" />
            {activeRepoName}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
