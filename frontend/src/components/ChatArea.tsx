"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Terminal, Sparkles, Loader2, Database, MessageSquare, Brain } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useChatStore } from "@/store/chatStore";
import { Skeleton } from "./Skeleton";
import { TypingIndicator } from "./TypingIndicator";

export function ChatArea() {
  const { 
    session, repoName, messages, addMessage, sessions, 
    currentSessionId, fetchSessions, setCurrentSessionId, 
    updateLastMessage, fetchMessages, messagesPage, hasMoreMessages 
  } = useChatStore();
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"ask" | "plan">("ask");
  
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
    const msgText = overrideMsg || input;
    if (!msgText.trim()) return;

    addMessage({ role: "user", content: msgText });
    setInput("");
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
              } catch (e) {}
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

          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-[50vh] text-center"
            >
              <div className="w-16 h-16 bg-blue-500/10 rounded-2xl border border-blue-500/20 flex items-center justify-center mb-6">
                <Database className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold mb-2">How can I help you with {repoName}?</h2>
              <p className="text-gray-400 max-w-md">
                I can analyze architecture, find bugs, write new features, and explain complex logic using the LangGraph agent loop.
              </p>
              
              <div className="flex gap-3 mt-8">
                {["Explain the architecture", "Find bugs in chunker.py"].map((quickMsg) => (
                  <button
                    key={quickMsg}
                    onClick={() => sendMessage(quickMsg)}
                    className="px-4 py-2 rounded-full glass text-sm hover:bg-white/10 transition border border-white/10"
                  >
                    {quickMsg}
                  </button>
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
              <div className="prose prose-invert max-w-[85%] prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
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
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
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
    </div>
  );
}
