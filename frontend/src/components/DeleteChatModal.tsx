"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, X, Loader2 } from "lucide-react";
import { useChatStore, ChatSession } from "@/store/chatStore";

interface DeleteChatModalProps {
  isOpen: boolean;
  chat: ChatSession | null;
  onClose: () => void;
}

export function DeleteChatModal({ isOpen, chat, onClose }: DeleteChatModalProps) {
  const { deleteSession } = useChatStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!chat) return;
    setIsDeleting(true);
    setError(null);

    try {
      await deleteSession(chat.id);
      setIsDeleting(false);
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError("Failed to delete chat session. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && chat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="glass-card w-full max-w-md rounded-2xl p-6 relative border border-white/10 shadow-2xl"
          >
            <button
              onClick={!isDeleting ? onClose : undefined}
              disabled={isDeleting}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete Chat</h3>
                <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone</p>
              </div>
            </div>

            <div className="space-y-3 mb-6 text-sm text-gray-300">
              <p>
                Are you sure you want to permanently delete this chat session?
              </p>
              <p className="text-xs text-gray-400 leading-relaxed">
                This will remove the chat history and all associated messages.
              </p>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition flex items-center gap-2 shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Chat</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
