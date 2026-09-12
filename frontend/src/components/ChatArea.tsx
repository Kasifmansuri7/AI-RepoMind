"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Terminal, Sparkles, Loader2, Database, MessageSquare, Brain, Code2, Bug, FileCode2, Paperclip, X, GitBranch } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useChatStore } from "@/store/chatStore";
import { Skeleton } from "./Skeleton";
import { TypingIndicator } from "./TypingIndicator";
import { supabase } from "@/utils/supabase/client";

export function ChatArea() {
  const { 
    session, repoName, messages, addMessage, sessions, 
    currentSessionId, fetchSessions, setCurrentSessionId, 
    updateLastMessage, fetchMessages, messagesPage, hasMoreMessages,
    isMessagesLoading, forkChat
  } = useChatStore();
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"ask" | "plan">("ask");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<{name: string, content: string}[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const topOfMessagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  useEffect(() => {
    if (!isFetchingMore) {
      endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, status, isFetchingMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      async (entries) => {
        if (entries[0].isIntersecting && hasMoreMessages && currentSessionId && !isFetchingMore) {
          setIsFetchingMore(true);
          await fetchMessages(currentSessionId, messagesPage + 1);
          setIsFetchingMore(false);
        }
      },
      { threshold: 1.0 }
    );
    if (topOfMessagesRef.current) observer.observe(topOfMessagesRef.current);
    return () => observer.disconnect();
  }, [hasMoreMessages, messagesPage, currentSessionId, isFetchingMore, fetchMessages]);

  const sendMessage = async (overrideMsg?: string) => {
    let msgText = overrideMsg || input;
    if (!msgText.trim() && attachedImages.length === 0 && attachedFiles.length === 0) return;

    if (attachedImages.length > 0) {
      const markdownImages = attachedImages.map(url => `![Attached Image](${url})`).join("\n\n");
      msgText = msgText ? `${msgText}\n\n${markdownImages}` : markdownImages;
    }

    if (attachedFiles.length > 0) {
      const markdownFiles = attachedFiles.map(f => `**File: \`${f.name}\`**\n\`\`\`\n${f.content}\n\`\`\``).join("\n\n");
      msgText = msgText ? `${msgText}\n\n${markdownFiles}` : markdownFiles;
    }

    addMessage({ role: "user", content: msgText });
    setInput("");
    setAttachedImages([]);
    setAttachedFiles([]);
    setIsLoading(true);
    setStatus("Thinking...");

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      const res = await axios.post(`${API_URL}/api/chat`, 
        { message: msgText, repo_name: repoName, mode, session_id: currentSessionId },
        {
          headers: { "Authorization": `Bearer ${session?.access_token}` },
          responseType: 'stream',
          adapter: 'fetch'
        }
      );

      const stream = res.data as unknown as ReadableStream<Uint8Array>;
      if (!stream) throw new Error("No response body");

      const reader = stream.getReader();
      const decoder = new TextDecoder("utf-8");
      let finalContent = "";
      addMessage({ role: "assistant", content: "" });

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (!dataStr) continue;
            
            if (line.includes('"token"')) {
              try {
                const parsed = JSON.parse(dataStr);
                finalContent += parsed.token;
                updateLastMessage(finalContent);
              } catch {
                // Ignore parse errors for partial chunks
              }
            } else if (line.includes('"content"')) {
              try {
                const parsed = JSON.parse(dataStr);
                finalContent = parsed.content;
                updateLastMessage(finalContent);
                if (parsed.session_id && !currentSessionId) {
                  setCurrentSessionId(parsed.session_id);
                  fetchSessions();
                }
                setStatus("");
              } catch {
                 console.error("Error parsing JSON: ", dataStr)
              }
            } else {
              setStatus(dataStr);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      addMessage({ role: "assistant", content: "**Error:** Failed to connect to backend." });
      setStatus("");
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  };

  return (
    <div className="flex-1 flex flex-col relative">
      <div className="absolute inset-0 overflow-y-auto p-6 scroll-smooth pb-40">
        <div className="max-w-4xl mx-auto space-y-6">
          {currentSession && messages.length > 0 && (
            <div className="flex items-center gap-2 mb-8 pb-4 border-b border-white/10">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-bold">{currentSession.title || 'New Chat'}</h2>
              <span className="px-2 py-1 bg-white/5 rounded-md text-xs text-gray-400 ml-auto border border-white/5 flex items-center gap-1">
                <Database className="w-3 h-3" />
                {currentSession.repo_id.split('_').slice(1).join('_') || repoName}
              </span>
            </div>
          )}

          {isMessagesLoading && messages.length === 0 ? (
            <div className="flex flex-col gap-6 py-4">
              <div className="flex gap-4 p-4 w-full justify-end">
                <Skeleton className="h-16 w-[40%] rounded-xl" />
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
              </div>
              <div className="flex gap-4 p-4 w-full justify-start">
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                <Skeleton className="h-24 w-[70%] rounded-xl" />
              </div>
              <div className="flex gap-4 p-4 w-full justify-end">
                <Skeleton className="h-12 w-[30%] rounded-xl" />
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
              </div>
              <div className="flex gap-4 p-4 w-full justify-start">
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                <Skeleton className="h-32 w-[60%] rounded-xl" />
              </div>
            </div>
          ) : messages.length === 0 && (
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
                  Welcome to {repoName}
                </h2>
                <p className="text-gray-400 text-base leading-relaxed mb-10">
                  I can analyze architecture, find bugs, write new features, and explain complex logic using the LangGraph agent loop.
                </p>
              </div>
              
              <div className="w-full flex flex-wrap justify-center gap-3">
                {[
                  "Explain the architecture",
                  "Find bugs in chunker.py",
                  "Write a new feature",
                  "Refactor database layer"
                ].map((quickMsg, i) => (
                  <motion.button
                    key={quickMsg}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * i, duration: 0.4 }}
                    onClick={() => sendMessage(quickMsg)}
                    className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors border border-white/10 text-sm text-gray-300 hover:text-white flex items-center gap-2 shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>{quickMsg}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.length > 0 && hasMoreMessages && (
            <div ref={topOfMessagesRef} className="py-4 flex flex-col gap-4">
              <div className="flex gap-4 p-4 w-full justify-start opacity-50">
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                <Skeleton className="h-16 w-[60%] rounded-xl" />
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className={`flex gap-4 p-4 w-full group ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mt-1">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}
              <div className="prose prose-invert max-w-[85%] prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 relative">
                <ReactMarkdown
                  components={{
                    img: ({ node, ...props }) => (
                      <img 
                        {...props} 
                        className="max-w-[150px] sm:max-w-[250px] h-auto rounded-xl border border-white/10 cursor-zoom-in hover:opacity-80 transition-opacity shadow-lg my-2 inline-block"
                        onClick={() => setSelectedImage(typeof props.src === 'string' ? props.src : null)}
                      />
                    )
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
                {msg.id && currentSessionId && (
                  <button 
                    onClick={() => forkChat(currentSessionId, msg.id!)}
                    title="Fork conversation from here"
                    className={`absolute ${msg.role === 'user' ? '-left-10' : '-right-10'} top-0 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white/5 hover:bg-white/10 rounded-md border border-white/10 text-gray-400 hover:text-white`}
                  >
                    <GitBranch className="w-4 h-4" />
                  </button>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/5 text-gray-300 border border-white/10 mt-1">
                  <Terminal className="w-4 h-4" />
                </div>
              )}
            </motion.div>
          ))}

          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: 10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                className="flex items-center gap-3 text-indigo-400 p-4"
              >
                {status === "Thinking..." ? (
                  <>
                    <TypingIndicator />
                    <span className="text-sm font-medium ml-2">{status}</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">{status}</span>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-20">
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          
          <div className="flex justify-center">
            <div className="bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/10 flex items-center gap-1">
              <button
                onClick={() => setMode("ask")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  mode === "ask" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "text-gray-400 hover:text-gray-200 border border-transparent"
                }`}
              >
                <MessageSquare className="w-4 h-4" /> Ask
              </button>
              <button
                onClick={() => setMode("plan")}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  mode === "plan" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" : "text-gray-400 hover:text-gray-200 border border-transparent"
                }`}
              >
                <Brain className="w-4 h-4" /> Composer
              </button>
            </div>
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

          <form 
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="relative glass rounded-2xl p-2 flex items-center gap-2 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-colors"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your codebase anything..."
              className="flex-1 bg-transparent border-none text-white px-4 py-3 focus:outline-none placeholder-gray-400"
              disabled={isLoading}
            />
            
            <input 
              type="file" 
              accept="image/*,text/*,application/json,.py,.tsx,.ts,.jsx,.js,.md,.log,.csv" 
              className="hidden" 
              ref={fileInputRef}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                
                // Explicitly reject video and audio
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
                  // Handle as text/code file
                  if (file.size > 100 * 1024) { // 100KB limit
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
              className="p-3 text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
            >
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>
            
            <button
              type="submit"
              disabled={(!input.trim() && attachedImages.length === 0 && attachedFiles.length === 0) || isLoading || isUploading}
              className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-xl transition-colors text-white"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-xs text-gray-500 mt-1">
            {mode === "ask" 
              ? "Ask mode provides fast answers using lightweight LLM chat." 
              : "Composer mode autonomously reason, search, and generate code."}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm cursor-zoom-out"
          >
            <motion.img 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              src={selectedImage} 
              alt="Full screen preview" 
              className="max-w-full max-h-full rounded-2xl shadow-2xl border border-white/20 cursor-default"
              onClick={(e) => e.stopPropagation()}
            />
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-6 right-6 p-2 bg-black/50 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
