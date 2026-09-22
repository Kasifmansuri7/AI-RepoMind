import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, GitCommit, Sparkles, Loader2 } from 'lucide-react';
import { useEditorStore } from '@/store/editorStore';
import { useGenerateCommitMessage } from '@/hooks/useEditor';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (message: string) => void;
  defaultMessage?: string;
  repoId?: string;
  isCommitting?: boolean;
}

export function CommitModal({ isOpen, onClose, onConfirm, defaultMessage = "", repoId, isCommitting }: CommitModalProps) {
  const [commitMessage, setCommitMessage] = useState(defaultMessage);
  const { modifiedFiles } = useEditorStore();
  const generateCommitMessageMutation = useGenerateCommitMessage();

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCommitMessage(defaultMessage);
    }
  }

  const handleGenerate = async () => {
    if (!repoId) return;
    try {
      const msg = await generateCommitMessageMutation.mutateAsync({ repoId, files: modifiedFiles });
      if (msg) setCommitMessage(msg);
    } catch {
      console.error("Failed to generate commit message.");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-[#1e1e1e] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-2 text-white font-medium">
                <GitCommit className="w-5 h-5 text-indigo-400" />
                Commit to GitHub
              </div>
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  Commit Message
                </label>
                {repoId && (
                  <button
                    onClick={handleGenerate}
                    disabled={generateCommitMessageMutation.isPending}
                    className="flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                  >
                    {generateCommitMessageMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Generate with AI
                  </button>
                )}
              </div>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                autoFocus
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all"
                placeholder="Enter a descriptive commit message..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    onConfirm(commitMessage);
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-2">
                Tip: Use <kbd className="bg-white/10 px-1 py-0.5 rounded border border-white/10">Cmd</kbd> + <kbd className="bg-white/10 px-1 py-0.5 rounded border border-white/10">Enter</kbd> to commit quickly.
              </p>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  onClick={onClose}
                  disabled={isCommitting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => onConfirm(commitMessage)}
                  disabled={!commitMessage.trim() || isCommitting}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg"
                >
                  {isCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isCommitting ? "Committing..." : "Commit Changes"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
