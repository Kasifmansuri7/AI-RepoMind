"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Terminal, Sparkles, Loader2, Database, MessageSquare, Brain, Code2, Bug, FileCode2, Paperclip, X, GitBranch, RefreshCw, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useChatStore } from "@/store/chatStore";
import { useMessages, useMessagesCache } from "@/hooks/useMessages";
import { useSessions, useForkSession } from "@/hooks/useSessions";
import { Skeleton } from "./Skeleton";
import { TypingIndicator } from "./TypingIndicator";
import { supabase } from "@/utils/supabase/client";
import { CodeBlock } from "@/components/CodeBlock";
import { useQueryClient } from "@tanstack/react-query";
import { useFileTree, useFileContent } from "@/hooks/useEditor";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { FileNode, useEditorStore } from "@/store/editorStore";
import { useRouter } from "next/navigation";
import apiClient from "@/utils/apiClient";

function flattenFileTree(node: FileNode, basePath: string = ""): string[] {
  let paths: string[] = [];
  if (node.type === 'file') {
    paths.push(node.path);
  } else if (node.children) {
    node.children.forEach(child => {
      paths.push(...flattenFileTree(child));
    });
  }
  return paths;
}

function FileMentionPill({ repoId, path, onRemove }: { repoId: string, path: string, onRemove: () => void }) {
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

const SUGGESTION_POOL = [
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

function CopyMessageButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button 
      onClick={handleCopy}
      title="Copy message"
      className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md border border-white/10 text-gray-400 hover:text-white transition-colors flex items-center justify-center"
    >
      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export function ChatArea() {
  const { 
    session, repoName, 
    currentSessionId, setCurrentSessionId, tenantId
  } = useChatStore();
  
  const { data: sessionsData } = useSessions(tenantId);
  const sessions = sessionsData?.pages.flatMap(p => p.items) || [];
  const currentSession = sessions.find(s => s.id === currentSessionId);

  const { data: messagesData, fetchNextPage, hasNextPage: hasMoreMessages, isFetching: isMessagesLoading } = useMessages(currentSessionId);
  const messages = messagesData?.pages.flatMap(p => p.items).reverse() || [];
  
  const activeRepoName = currentSession ? currentSession.repo_id.split('_').slice(1).join('_') : repoName;

  const { addMessage, updateLastMessage } = useMessagesCache(currentSessionId);
  const forkSessionMutation = useForkSession();
  const router = useRouter();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"auto" | "ask" | "plan">("auto");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<{name: string, content: string}[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);

  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const queryClient = useQueryClient();
  const { data: fileTree } = useFileTree(activeRepoName);
  const allFiles = fileTree ? flattenFileTree(fileTree) : [];
  const filteredFiles = allFiles.filter(f => f.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 10);

  const refreshSuggestions = () => {
    const shuffled = [...SUGGESTION_POOL].sort(() => 0.5 - Math.random());
    setCurrentSuggestions(shuffled.slice(0, 4));
  };

  useEffect(() => {
    refreshSuggestions();
  }, []);
  
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

  // Reset to auto mode when switching sessions or starting a new chat
  useEffect(() => {
    setMode("auto");
  }, [currentSessionId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreMessages && currentSessionId && !isFetchingMore && !isMessagesLoading) {
          setIsFetchingMore(true);
          fetchNextPage().finally(() => setIsFetchingMore(false));
        }
      },
      { threshold: 1.0 }
    );
    if (topOfMessagesRef.current) observer.observe(topOfMessagesRef.current);
    return () => observer.disconnect();
  }, [hasMoreMessages, currentSessionId, isFetchingMore, isMessagesLoading, fetchNextPage]);

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

    const mentionRegex = /@([a-zA-Z0-9_./-]+)/g;
    const matches = Array.from(msgText.matchAll(mentionRegex)).map(m => m[1]);
    const uniqueMentions = Array.from(new Set(matches)).filter(path => allFiles.includes(path));

    if (uniqueMentions.length > 0) {
      const appendedFiles = [];
      
      for (const path of uniqueMentions) {
        const regex = new RegExp(`@${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
        msgText = msgText.replace(regex, `[${path.split('/').pop()}](#file-mention:${path})`);
        
        try {
          const fileData = await queryClient.fetchQuery({
            queryKey: queryKeys.fileContent(activeRepoName!, path),
            queryFn: async () => {
              const res = await apiClient.get(`/repos/${encodeURIComponent(activeRepoName!)}/files/content`, {
                params: { path }
              });
              return res.data;
            },
            staleTime: 1000 * 60 * 60,
          });
          appendedFiles.push(`\`\`\`file-mention:${path}\n${fileData?.content || "File content not available"}\n\`\`\``);
        } catch (e) {
          console.error("Failed to fetch file content for mention:", path, e);
        }
      }
      
      if (appendedFiles.length > 0) {
        msgText = msgText ? `${msgText}\n\n${appendedFiles.join('\n\n')}` : appendedFiles.join('\n\n');
      }
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
        { message: msgText, repo_name: activeRepoName, mode, session_id: currentSessionId },
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
        
        let currentEvent = "message";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.replace("event: ", "").trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (!dataStr) continue;
            
            if (currentEvent === "error") {
              addMessage({ role: "assistant", content: `**Error:** ${dataStr}` });
              setStatus("");
              continue;
            }
            
            if (line.includes('"token"')) {
              try {
                const parsed = JSON.parse(dataStr);
                finalContent += parsed.token;
                updateLastMessage(finalContent);
              } catch {
                // Ignore parse errors for partial chunks
              }
            } else if (line.includes('"mode"')) {
              try {
                const parsed = JSON.parse(dataStr);
                setMode(parsed.mode);
              } catch {}
            } else if (line.includes('"content"')) {
              try {
                const parsed = JSON.parse(dataStr);
                finalContent = parsed.content;
                updateLastMessage(finalContent);
                if (parsed.session_id && !currentSessionId) {
                  setCurrentSessionId(parsed.session_id);
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
                {activeRepoName}
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
                  Welcome to {activeRepoName || "AI-RepoMind"}
                </h2>
                <p className="text-gray-400 text-base leading-relaxed mb-10">
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
                      onClick={() => sendMessage(quickMsg)}
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
              <div className={`flex flex-col gap-1 ${msg.role === 'assistant' ? 'w-full min-w-0' : 'max-w-[85%]'}`}>
                <div className={`prose prose-invert ${msg.role === 'assistant' ? 'max-w-none' : ''}`}>
                  <ReactMarkdown
                    components={{
                      a: ({ node, ...props }) => {
                        if (props.href?.startsWith("#file-mention:")) {
                          const path = props.href.replace("#file-mention:", "");
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                useEditorStore.getState().setActiveFile(path);
                                router.push('/editor');
                              }}
                              className="inline-flex items-center gap-1 px-1.5 mx-0.5 rounded-md bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors cursor-pointer border border-indigo-500/30 align-baseline"
                            >
                              <FileCode2 className="w-3 h-3" />
                              {props.children}
                            </button>
                          );
                        }
                        return <a {...props} className="text-blue-400 hover:underline" />;
                      },
                      img: ({ node, ...props }) => (
                        <img 
                          {...props} 
                          className="max-w-[150px] sm:max-w-[250px] h-auto rounded-xl border border-white/10 cursor-zoom-in hover:opacity-80 transition-opacity shadow-lg my-2 inline-block"
                          onClick={() => setSelectedImage(typeof props.src === 'string' ? props.src : null)}
                        />
                      ),
                      code: ({node, className, children, ...props}) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const fileMentionMatch = /language-file-mention:(.+)/.exec(className || '');
                        
                        if (fileMentionMatch) {
                          const path = fileMentionMatch[1];
                          return (
                            <button 
                              type="button"
                              onClick={() => useEditorStore.getState().setActiveFile(path)}
                              className="text-indigo-400 hover:text-indigo-300 underline font-mono text-sm flex items-center gap-1 my-2"
                            >
                              <FileCode2 className="w-4 h-4" />
                              {path}
                            </button>
                          );
                        }
                        
                        return match ? (
                          <CodeBlock language={match[1]} value={String(children).replace(/\n$/, '')} />
                        ) : (
                          <code className="bg-black/40 rounded px-1.5 py-0.5 text-pink-300 font-mono text-[13px]" {...props}>
                            {children}
                          </code>
                        );
                      }
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                  <CopyMessageButton content={msg.content} />
                  {msg.id && currentSessionId && (
                    <button 
                      onClick={() => forkSessionMutation.mutate(
                        { sessionId: currentSessionId, messageId: msg.id! },
                        { onSuccess: (newId) => setCurrentSessionId(newId) }
                      )}
                      disabled={forkSessionMutation.isPending}
                      title="Fork conversation from here"
                      className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md border border-white/10 text-gray-400 hover:text-white disabled:opacity-50"
                    >
                      <GitBranch className="w-4 h-4" />
                    </button>
                  )}
                </div>
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

      <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-12 bg-gradient-to-t from-[var(--background)] via-[var(--background)] via-60% to-transparent pointer-events-none z-10">
        <div className="max-w-3xl mx-auto flex flex-col gap-2 pointer-events-auto">
          
          <div className="flex justify-start px-2">
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
              className="relative bg-[#1e1e2e]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-col gap-2 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all shadow-2xl"
            >
              <textarea
                ref={inputRef as any}
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
                className="w-full bg-transparent border-none text-white px-3 py-2 focus:outline-none placeholder-gray-500 disabled:opacity-50 resize-none custom-scrollbar"
                disabled={isLoading || !activeRepoName}
              />
              
              <div className="flex items-center justify-between px-1 pb-1">
                <div className="flex items-center gap-1">
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
                    className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                  </button>
                </div>
                
                <button
                  type="submit"
                  disabled={(!input.trim() && attachedImages.length === 0 && attachedFiles.length === 0) || isLoading || isUploading}
                  className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 rounded-lg transition-colors text-white shadow-md flex items-center justify-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
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
