"use client";

import { ArchitectureFlow } from "@/components/ArchitectureFlow";
import { motion } from "framer-motion";

export default function ArchitecturePage() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col h-full bg-[#0a0a0a]"
    >
      <div className="p-4 md:p-6 pb-0 flex-shrink-0">
        <h1 className="text-2xl font-bold text-white mb-2">Application Architecture</h1>
        <p className="text-gray-400 text-sm max-w-2xl">
          Visual representation of the AI-RepoMind system components and their interactions. 
          Use the mouse to drag, zoom, and explore the different parts of the architecture.
        </p>
      </div>
      
      {/* Container for React Flow */}
      <div className="flex-1 w-full relative mt-4 border-t border-white/10">
        <ArchitectureFlow />
      </div>
    </motion.div>
  );
}
