import { useState, useRef } from "react";
import { Send, Loader2, FileCode2, Paperclip, X, Sparkles, MessageSquare, Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/utils/supabase/client";
import { useFileContent } from "@/hooks/useEditor";
import { useRouter } from "next/navigation";

export function FileMentionPill({ repoId, path, onRemove }: { repoId: string, path: string, onRemove: () => void }) {
  const { data, isLoading } = useFileContent(repoId, path);
  
  return (
    <div className="relative group flex flex-col gap-1 bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-lg min-w-[200px] max-w-[300px]">
      <div className="flex items-center gap-2 pr-4">
        <FileCode2 className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="text-xs text-indigo-200 font-mono truncate">{path}</span>
        <button
          onClick={onRemove}
          className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="text-[10px] text-indigo-300/70 leading-tight border-t border-indigo-500/10 pt-1 mt-1">
        {isLoading ? (
          <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Fetching file...</span>
        ) : (
          <span className="line-clamp-2 text-indigo-200/50">{(data?.content || "").slice(0, 100).replace(/\n/g, " ")}...</span>
        )}
      </div>
    </div>
  );
}

interface ChatInputFormProps {
  input: string;
  setInput: (val: string) => void;
  isLoading: boolean;
  activeRepoName: string | undefined;
  mode: "auto" | "ask" | "plan";
  setMode: (mode: "auto" | "ask" | "plan") => void;
  sendMessage: () => void;
  attachedImages: string[];
  setAttachedImages: React.Dispatch<React.SetStateAction<string[]>>;
  attachedFiles: {name: string, content: string}[];
  setAttachedFiles: React.Dispatch<React.SetStateAction<{name: string, content: string}[]>>;
  filteredFiles: string[];
  setMentionQuery: (q: string) => void;
}

export function ChatInputForm({
  input, setInput, isLoading, activeRepoName, mode, setMode, sendMessage,
  attachedImages, setAttachedImages, attachedFiles, setAttachedFiles, filteredFiles,
  setMentionQuery
}: ChatInputFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);

  return (
    <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-12 bg-gradient-to-t from-[var(--background)] via-[var(--background)] via-60% to-transparent pointer-events-none z-10">
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-2 pointer-events-auto px-4">
        
        <div className="flex justify-start items-center gap-2 px-2">
          <div className="bg-white/5 backdrop-blur-md p-1 rounded-lg border border-white/10 flex items-center gap-1 shadow-sm">
            {[
              { id: "auto", label: "Auto", icon: Sparkles, color: "text-gray-300 hover:text-white", bg: "bg-white/10", border: "border-white/10" },
              { id: "ask", label: "Ask", icon: MessageSquare, color: "text-gray-300 hover:text-white", bg: "bg-white/10", border: "border-white/10" },
              { id: "plan", label: "Composer", icon: Brain, color: "text-gray-300 hover:text-white", bg: "bg-white/10", border: "border-white/10" }
            ].map((m) => {
              const Icon = m.icon;
              const isActive = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id as "auto" | "ask" | "plan")}
                  className={`relative flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    isActive ? "text-white" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="active-mode-pill"
                      className={`absolute inset-0 rounded-md border ${m.bg} ${m.border} shadow-sm`}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">{m.label}</span>
                </button>
              );
            })}
          </div>
          
          {activeRepoName && (
            <div className="bg-white/5 backdrop-blur-md p-1 rounded-lg border border-white/10 flex items-center shadow-sm">
              <button
                onClick={() => router.push('/editor')}
                title="Open code editor"
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <FileCode2 className="w-4 h-4" />
                <span>Editor</span>
              </button>
            </div>
          )}
        </div>

        {(attachedImages.length > 0 || attachedFiles.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 bg-black/40 backdrop-blur-md rounded-xl border border-white/10">
            {attachedImages.map((url, idx) => (
              <div key={`img-${idx}`} className="relative group">
                <img src={url} alt="Attached preview" className="h-16 w-16 object-cover rounded-lg border border-white/20" />
                <button
                  onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {attachedFiles.map((f, idx) => (
              <div key={`file-${idx}`} className="relative group flex items-center gap-2 bg-white/5 border border-white/10 p-2 rounded-lg pr-4">
                <FileCode2 className="w-8 h-8 text-indigo-400" />
                <span className="text-xs text-gray-300 max-w-[100px] truncate">{f.name}</span>
                <button
                  onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <AnimatePresence>
            {showMentionMenu && activeRepoName && filteredFiles.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 mb-2 w-80 max-h-64 overflow-y-auto bg-[#1e1e2e] border border-white/10 rounded-xl shadow-2xl p-2 z-50 flex flex-col gap-1 custom-scrollbar"
              >
                <div className="px-2 py-1.5 text-xs text-gray-400 font-medium">Mention a file</div>
                {filteredFiles.map((path, idx) => (
                  <button
                    key={path}
                    type="button"
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => {
                      setShowMentionMenu(false);
                      const lastAt = input.lastIndexOf("@");
                      if (lastAt !== -1) {
                        setInput(input.substring(0, lastAt) + "@" + path + " ");
                      }
                      inputRef.current?.focus();
                    }}
                    className={`flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors text-left ${
                      idx === mentionIndex ? "bg-white/10 text-white" : "text-gray-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <FileCode2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="truncate">{path}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <form 
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="relative bg-[#1e1e2e]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 flex items-end gap-2 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-2xl"
          >
            <div className="flex items-center shrink-0 mb-0.5">
              <input 
                type="file" 
                accept="image/*,text/*,application/json,.py,.tsx,.ts,.jsx,.js,.md,.log,.csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
                    alert("Videos and audio files are not supported.");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    return;
                  }
                  
                  if (file.type.startsWith('image/')) {
                    setIsUploading(true);
                    try {
                      const filename = `${Date.now()}_${file.name}`;
                      const { data, error } = await supabase.storage
                        .from('chat-attachments')
                        .upload(filename, file);
                      
                      if (error) throw error;
                      
                      const { data: { publicUrl } } = supabase.storage
                        .from('chat-attachments')
                        .getPublicUrl(filename);
                        
                      setAttachedImages(prev => [...prev, publicUrl]);
                    } catch (err) {
                      console.error("Upload failed:", err);
                      alert("Failed to upload image.");
                    } finally {
                      setIsUploading(false);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }
                  } else {
                    if (file.size > 100 * 1024) { 
                      alert("Text files must be smaller than 100KB to fit in the AI context window.");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                      return;
                    }
                    
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      const content = e.target?.result as string;
                      setAttachedFiles(prev => [...prev, { name: file.name, content }]);
                    };
                    reader.readAsText(file);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }
                }}
              />
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isLoading}
                className="p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
              >
                {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
              </button>
            </div>

            <textarea
              ref={inputRef}
              value={input}
              rows={Math.min(5, Math.max(1, input.split('\n').length))}
              onChange={(e) => {
                const val = e.target.value;
                setInput(val);
                const lastAt = val.lastIndexOf("@");
                if (lastAt !== -1 && (lastAt === 0 || val[lastAt - 1] === " ")) {
                  setShowMentionMenu(true);
                  setMentionQuery(val.substring(lastAt + 1));
                  setMentionIndex(0);
                } else {
                  setShowMentionMenu(false);
                }
              }}
              onKeyDown={(e) => {
                if (showMentionMenu && filteredFiles.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex(prev => Math.min(filteredFiles.length - 1, prev + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex(prev => Math.max(0, prev - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const path = filteredFiles[mentionIndex];
                    if (path) {
                      setShowMentionMenu(false);
                      const lastAt = input.lastIndexOf("@");
                      if (lastAt !== -1) {
                        setInput(input.substring(0, lastAt) + "@" + path + " ");
                      }
                    }
                  } else if (e.key === "Escape") {
                    setShowMentionMenu(false);
                  }
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() || attachedImages.length > 0 || attachedFiles.length > 0) {
                    sendMessage();
                  }
                }
              }}
              placeholder={activeRepoName ? "Ask your codebase anything... Use @ to mention files" : "Select a repository to start chatting..."}
              className="flex-1 bg-transparent border-none text-white py-3 focus:outline-none placeholder-gray-500 disabled:opacity-50 resize-none custom-scrollbar leading-relaxed"
              disabled={isLoading || !activeRepoName}
            />
            
            <div className="flex items-center shrink-0 mb-0.5 pr-0.5">
              <button
                type="submit"
                disabled={(!input.trim() && attachedImages.length === 0 && attachedFiles.length === 0) || isLoading || isUploading}
                className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl transition-colors text-white shadow-md flex items-center justify-center"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
