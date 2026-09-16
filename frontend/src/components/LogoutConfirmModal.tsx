import { motion, AnimatePresence } from "framer-motion";

interface LogoutConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmModal({ isOpen, onClose, onConfirm }: LogoutConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="glass-card w-full max-w-sm rounded-2xl p-6 shadow-xl"
          >
            <h2 className="text-xl font-bold mb-3">Confirm Logout</h2>
            <p className="text-sm text-gray-400 mb-6">
              Are you sure you want to log out of your account?
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors"
              >
                Log out
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
