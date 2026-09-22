import React, { useState } from "react";
import { Copy, Check, Terminal, Sparkles, FileCode2, GitBranch } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { CodeBlock } from "@/components/CodeBlock";
import { useEditorStore } from "@/store/editorStore";
import { useChatStore } from "@/store/chatStore";
import apiClient from "@/utils/apiClient";
import { useRouter } from "next/navigation";

export function CopyMessageButton({ content }: { content: string }) {
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
      className="p-1 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors flex items-center justify-center"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

interface Message {
  id?: string;
  role: string;
  content: string;
}

interface ChatMessageItemProps {
  msg: Message;
  idx: number;
  totalMessages: number;
  isLoading: boolean;
  currentSessionId: string | null;
  allFiles: string[];
  onForkSession: (messageId: string) => void;
  isForking: boolean;
}

export function ChatMessageItem({ 
  msg, idx, totalMessages, isLoading, 
  currentSessionId, allFiles, onForkSession, isForking 
}: ChatMessageItemProps) {
  const router = useRouter();

  return (
    <motion.div
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
      <div className={`flex flex-col gap-1 min-w-0 ${msg.role === "user" ? "max-w-[85%] items-end" : "flex-1 items-start w-full mr-11"}`}>
        <div className={`${msg.role === "user" ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20 inline-block" : "bg-white/5 border border-white/10 w-full"} rounded-2xl p-3 px-4 overflow-x-auto max-w-full custom-scrollbar`}>
          <div className={`prose prose-invert max-w-none text-sm font-sans ${msg.role === "user" ? "prose-p:leading-relaxed" : ""}`}>
            <ReactMarkdown
              components={{
                a({ href, children, ...props }) {
                  if (href?.startsWith('file://')) {
                    const path = href.replace('file://', '');
                    const buttonProps = props as Record<string, unknown>;
                    if ('node' in buttonProps) delete buttonProps.node;
                    return (
                      <button 
                        type="button"
                        onClick={() => useEditorStore.getState().setActiveFile(path)}
                        className="text-indigo-400 hover:text-indigo-300 underline font-mono text-sm"
                        {...(buttonProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
                      >
                        {children}
                      </button>
                    );
                  }
                  const anchorProps = props as Record<string, unknown>;
                  if ('node' in anchorProps) delete anchorProps.node;
                  return <a href={href} {...(anchorProps as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>;
                },
                pre: ({ children }: { children?: React.ReactNode }) => {
                  if (children && typeof children === 'object' && 'props' in children) {
                    // ReactMarkdown passes the <code> element as the child of <pre>
                    // We clone it and inject an isBlock flag so the code component knows it's block-level
                    return React.cloneElement(children as React.ReactElement, { isBlock: true } as Record<string, unknown>);
                  }
                  return <>{children}</>;
                },
                code: ({ className, children, isBlock, ...props }: React.HTMLAttributes<HTMLElement> & { isBlock?: boolean, node?: unknown }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const fileMentionMatch = /language-file-mention:(.+)/.exec(className || '');
                  const fileChangeMatch = /language-file-change:(.+)/.exec(className || '');
                  
                  if (fileChangeMatch) {
                    const path = fileChangeMatch[1];
                    const fileName = path.split(/[\\/]/).pop() || path;
                    
                    return (
                      <div className="flex flex-col gap-2 my-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-indigo-500/10 border-b border-indigo-500/20 gap-4">
                          <div className="flex items-center gap-2 text-indigo-300 font-medium min-w-0 flex-1">
                            <FileCode2 className="w-5 h-5 text-indigo-400 shrink-0" />
                            <div className="flex items-center min-w-0 flex-1 text-sm" title={path}>
                              <span className="shrink-0">File Proposed:&nbsp;</span>
                              <span className="shrink-0 font-bold text-indigo-200">{fileName}</span>
                            </div>
                          </div>
                          <button 
                            onClick={async () => {
                              try {
                                const newContent = String(children).replace(/\n$/, '');
                                const repoId = useChatStore.getState().repoName;
                                let original = "";
                                try {
                                  const res = await apiClient.get(`/repos/${repoId}/files/content?path=${encodeURIComponent(path)}`);
                                  original = res.data.content;
                                } catch {
                                  console.log("File might be new, no original content found.");
                                }
                                useEditorStore.getState().updateModifiedFile(path, original, newContent);
                                useEditorStore.getState().setActiveFile(path);
                                useEditorStore.getState().setFileContent(newContent);
                                useEditorStore.getState().setOriginalFileContent(original);
                                router.push('/editor');
                              } catch (err) {
                                console.error("Failed to stage changes", err);
                              }
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg shadow-sm transition-colors flex items-center gap-1"
                          >
                            Stage in Editor
                          </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar p-2">
                          <CodeBlock language={path.split('.').pop() || 'text'} value={String(children).replace(/\n$/, '')} />
                        </div>
                      </div>
                    );
                  }

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
                  
                  const isBlockCode = isBlock || match || String(children).includes('\n');
                  
                  if (!isBlockCode) {
                    const textContent = String(children).trim();
                    const matchedFile = allFiles.find(f => f.endsWith('/' + textContent) || f === textContent);
                    
                    if (matchedFile && textContent.includes('.')) {
                      return (
                        <button 
                          type="button"
                          onClick={() => {
                            useEditorStore.getState().setActiveFile(matchedFile);
                            router.push('/editor');
                          }}
                          className="inline-flex items-center gap-1 bg-indigo-500/20 hover:bg-indigo-500/30 rounded px-1.5 py-0.5 text-indigo-300 transition-colors cursor-pointer border border-indigo-500/30 align-baseline mx-0.5 font-mono text-[13px]"
                          title={`Open ${matchedFile}`}
                        >
                          <FileCode2 className="w-3 h-3" />
                          {children}
                        </button>
                      );
                    }

                    return (
                      <code className="bg-black/40 rounded px-1.5 py-0.5 text-pink-300 font-mono text-[13px]" {...props}>
                        {children}
                      </code>
                    );
                  }
                  
                  const language = match ? match[1] : 'text';
                  return <CodeBlock language={language} value={String(children).replace(/\n$/, '')} />;
                }
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        </div>
        <AnimatePresence>
          {!(isLoading && idx === totalMessages - 1 && msg.role === "assistant") && (
            <motion.div 
              initial={{ opacity: 0, height: 0, y: -5 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className={`flex items-center gap-1 overflow-hidden ${msg.role === "user" ? "justify-end" : "justify-start"} px-1 mt-1`}
            >
              <CopyMessageButton content={msg.content} />
              {currentSessionId && (
                <button 
                  onClick={() => msg.id && onForkSession(msg.id)}
                  disabled={isForking || !msg.id}
                  title="Fork conversation from here"
                  className={`p-1 hover:bg-white/10 rounded-md text-gray-400 transition-all duration-300 ${
                    !msg.id ? 'opacity-0 cursor-default' : 'hover:text-white disabled:opacity-50'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {msg.role === "user" && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-white/5 text-gray-300 border border-white/10 mt-1">
          <Terminal className="w-4 h-4" />
        </div>
      )}
    </motion.div>
  );
}
