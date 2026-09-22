"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useChatStore } from "@/store/chatStore";
import { useMessages, useMessagesCache } from "@/hooks/useMessages";
import { useSessions, useForkSession } from "@/hooks/useSessions";
import { Skeleton } from "./Skeleton";
import { TypingIndicator } from "./TypingIndicator";
import { useQueryClient } from "@tanstack/react-query";
import { useFileTree } from "@/hooks/useEditor";
import { queryKeys } from "@/lib/react-query/queryKeys";
import { FileNode } from "@/store/editorStore";
import apiClient from "@/utils/apiClient";
import { useRouter, usePathname } from "next/navigation";

// Import modular components
import { ChatWelcomeScreen } from "./chat/ChatWelcomeScreen";
import { ChatMessageItem } from "./chat/ChatMessageItem";
import { ChatInputForm } from "./chat/ChatInputForm";

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

export function ChatArea() {
  const { 
    session, repoName, 
    currentSessionId, setCurrentSessionId, tenantId,
    mode, setMode
  } = useChatStore();
  
  const { data: sessionsData } = useSessions(tenantId);
  const sessions = sessionsData?.pages.flatMap(p => p.items) || [];
  const currentSession = sessions.find(s => s.id === currentSessionId);

  const { data: messagesData, fetchNextPage, hasNextPage: hasMoreMessages, isFetching: isMessagesLoading } = useMessages(currentSessionId);
  const messages = messagesData?.pages.flatMap(p => p.items).reverse() || [];
  
  const activeRepoName = currentSession ? currentSession.repo_id.split('_').slice(1).join('_') : repoName;

  const { addMessage, updateLastMessage } = useMessagesCache(currentSessionId);
  const forkSessionMutation = useForkSession();
  
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<{name: string, content: string}[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const [mentionQuery, setMentionQuery] = useState("");

  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const { data: fileTree } = useFileTree(activeRepoName);
  const allFiles = fileTree ? flattenFileTree(fileTree) : [];
  const filteredFiles = allFiles.filter(f => f.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 10);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const topOfMessagesRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  useEffect(() => {
    if (!isFetchingMore && shouldAutoScrollRef.current) {
      isProgrammaticScrollRef.current = true;
      endOfMessagesRef.current?.scrollIntoView({ behavior: isLoading ? "auto" : "smooth" });
      
      const timer = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [messages, status, isFetchingMore, isLoading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isProgrammaticScrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;
    
    shouldAutoScrollRef.current = isAtBottom;
  };

  useEffect(() => {
    setMode("auto");
    shouldAutoScrollRef.current = false;
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
    shouldAutoScrollRef.current = true;

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      let activeId = currentSessionId || 'pending';
      const localUpdateLastMessage = (content: string) => {
        queryClient.setQueryData(queryKeys.messages(activeId), (oldData: any) => {
          if (!oldData || !oldData.pages) return oldData;
          const newPages = [...oldData.pages];
          if (newPages.length > 0 && newPages[0].items?.length > 0) {
            const updatedItems = [...newPages[0].items];
            updatedItems[0] = { ...updatedItems[0], content };
            newPages[0] = { ...newPages[0], items: updatedItems };
          }
          return { ...oldData, pages: newPages };
        });
      };

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
      let currentEvent = "message";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.trim() === "") {
            currentEvent = "message";
            continue;
          }
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
            if (currentEvent === "session_created") {
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.session_id && !currentSessionId) {
                  const pendingData = queryClient.getQueryData(queryKeys.messages('pending'));
                  if (pendingData) {
                    queryClient.setQueryData(queryKeys.messages(parsed.session_id), pendingData);
                    queryClient.removeQueries({ queryKey: queryKeys.messages('pending') });
                  }
                  setCurrentSessionId(parsed.session_id);
                  activeId = parsed.session_id;
                  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
                    window.history.replaceState(null, '', `/chat/${parsed.session_id}`);
                  }
                  queryClient.setQueryData(queryKeys.sessionsBase(), (old: any) => {
                    if (!old) return old;
                    const newPages = [...old.pages];
                    if (newPages.length > 0) {
                       newPages[0] = {
                        ...newPages[0],
                        items: [{ id: parsed.session_id, title: parsed.title || "New Chat", repo_id: "", created_at: new Date().toISOString() }, ...newPages[0].items]
                      };
                    }
                    return { ...old, pages: newPages };
                  });
                  queryClient.invalidateQueries({ queryKey: queryKeys.sessionsBase() });
                }
              } catch {}
            } else if (currentEvent === "title_updated") {
              try {
                const parsed = JSON.parse(dataStr);
                queryClient.setQueryData(queryKeys.sessionsBase(), (old: any) => {
                  if (!old) return old;
                  const newPages = [...old.pages];
                  if (newPages.length > 0) {
                    newPages[0] = {
                      ...newPages[0],
                      items: newPages[0].items.map((item: any) => 
                        item.id === currentSessionId || item.id === parsed.session_id 
                          ? { ...item, title: parsed.title } 
                          : item
                      )
                    };
                  }
                  return { ...old, pages: newPages };
                });
                queryClient.invalidateQueries({ queryKey: queryKeys.sessionsBase() });
              } catch {}
            } else if (currentEvent === "token") {
              try {
                const parsed = JSON.parse(dataStr);
                finalContent += parsed.token;
                localUpdateLastMessage(finalContent);
                setStatus("");
              } catch {}
            } else if (currentEvent === "mode_switch") {
              try {
                const parsed = JSON.parse(dataStr);
                setMode(parsed.mode);
                if (parsed.mode === 'architecture') {
                  router.push(`/architecture/${encodeURIComponent(activeRepoName!)}`);
                }
              } catch {}
            } else if (currentEvent === "message") {
              try {
                const parsed = JSON.parse(dataStr);
                finalContent = parsed.content;
                localUpdateLastMessage(finalContent);
                if (parsed.session_id && !currentSessionId) {
                  const pendingData = queryClient.getQueryData(queryKeys.messages('pending'));
                  if (pendingData) {
                    queryClient.setQueryData(queryKeys.messages(parsed.session_id), pendingData);
                    queryClient.removeQueries({ queryKey: queryKeys.messages('pending') });
                  }
                  setCurrentSessionId(parsed.session_id);
                  if (pathname === '/chat' || pathname.startsWith('/chat/')) {
                    window.history.replaceState(null, '', `/chat/${parsed.session_id}`);
                  }
                  queryClient.invalidateQueries({ queryKey: queryKeys.sessionsBase() });
                }
                setStatus("");
              } catch {
                 console.error("Error parsing JSON: ", dataStr)
              }
            } else if (currentEvent === "status") {
              setStatus(dataStr);
            }
          }
        }
      }
    } catch (error: any) {
      console.error(error);
      let errorMsg = "Failed to connect to backend.";
      if (error.response?.status === 400) {
        errorMsg = "Invalid request.";
      } else if (error.response?.data?.detail) {
        errorMsg = typeof error.response.data.detail === 'string' ? error.response.data.detail : "Invalid request.";
      }
      addMessage({ role: "assistant", content: `**Error:** ${errorMsg}` });
      setStatus("");
    } finally {
      setIsLoading(false);
      if (currentSessionId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.messages(currentSessionId) });
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col relative">
      <div 
        className="absolute inset-0 overflow-y-auto p-6 scroll-smooth pb-40" 
        onScroll={handleScroll}
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
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
            <ChatWelcomeScreen 
              activeRepoName={activeRepoName} 
              onSendMessage={sendMessage} 
            />
          )}

          {messages.length > 0 && hasMoreMessages && (
            <div ref={topOfMessagesRef} className="py-4 flex flex-col gap-4">
              <div className="flex gap-4 p-4 w-full justify-start opacity-50">
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                <Skeleton className="h-16 w-[60%] rounded-xl" />
              </div>
            </div>
          )}

          {messages.map((msg, idx) => {
            if (msg.role === "assistant" && !msg.content?.trim()) {
              return null;
            }
            return (
              <ChatMessageItem 
                key={idx}
                msg={msg}
                idx={idx}
                totalMessages={messages.length}
                isLoading={isLoading}
                currentSessionId={currentSessionId}
                allFiles={allFiles}
                onForkSession={(msgId) => forkSessionMutation.mutate(
                  { sessionId: currentSessionId!, messageId: msgId },
                  { onSuccess: (newId) => setCurrentSessionId(newId) }
                )}
                isForking={forkSessionMutation.isPending}
              />
            );
          })}

          <AnimatePresence mode="wait">
            {status && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: 10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 text-indigo-400 p-4">
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <ChatInputForm 
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        activeRepoName={activeRepoName}
        mode={mode}
        setMode={setMode}
        sendMessage={sendMessage}
        attachedImages={attachedImages}
        setAttachedImages={setAttachedImages}
        attachedFiles={attachedFiles}
        setAttachedFiles={setAttachedFiles}
        filteredFiles={filteredFiles}
        setMentionQuery={setMentionQuery}
      />

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
