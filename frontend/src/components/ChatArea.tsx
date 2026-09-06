"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Terminal, Sparkles, Loader2, Database } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { useChatStore } from "@/store/chatStore";

export function ChatArea() {
  const { tenantId, repoName, messages, setMessages, addMessage } = useChatStore();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const sendMessage = async (overrideMsg?: string) => {
    const msgText = overrideMsg || input;
    if (!msgText.trim()) return;

    addMessage({ role: "user", content: msgText });
    setInput("");
    setIsLoading(true);
    setStatus("Initializing agent...");

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      const res = await axios.post(`${API_URL}/api/chat`, 
        { message: msgText, repo_name: repoName },
        {
          headers: { "X-Tenant-ID": tenantId },
          responseType: 'stream',
          adapter: 'fetch'
        }
      );

      const stream = res.data as unknown as ReadableStream<Uint8Array>;
      if (!stream) throw new Error("No response body");

      const reader = stream.getReader();
      const decoder = new TextDecoder("utf-8");
      let finalContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (!dataStr) continue;
            
            if (line.includes('"content"')) {
              try {
                const parsed = JSON.parse(dataStr);
                finalContent = parsed.content;
                addMessage({ role: "assistant", content: finalContent });
                setStatus("");
              } catch {
                 // Ignore partial json parse errors
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
    }
  };

  return (
    <div className="flex-1 flex flex-col relative">
      <div className="absolute inset-0 overflow-y-auto p-6 scroll-smooth pb-40">
        <div className="max-w-4xl mx-auto space-y-6">
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

          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-4 ${msg.role === "assistant" ? "bg-white/[0.02] p-6 rounded-2xl border border-white/5" : "p-4"}`}
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                msg.role === "assistant" 
                  ? "bg-gradient-to-tr from-blue-500 to-purple-500" 
                  : "bg-gray-700"
              }`}>
                {msg.role === "assistant" ? <Sparkles className="w-4 h-4 text-white" /> : <Terminal className="w-4 h-4 text-white" />}
              </div>
              <div className="flex-1 prose prose-invert max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </motion.div>
          ))}

          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 text-blue-400 p-4"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">{status}</span>
              </motion.div>
            )}
          </AnimatePresence>
          
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-20">
        <div className="max-w-4xl mx-auto">
          <form 
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="relative glass rounded-2xl p-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your codebase anything..."
              className="flex-1 bg-transparent border-none text-white px-4 py-3 focus:outline-none placeholder-gray-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-xl transition text-white"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-xs text-gray-500 mt-3">
            AI-RepoMind uses LangGraph to autonomously reason, search, and code.
          </p>
        </div>
      </div>
    </div>
  );
}
