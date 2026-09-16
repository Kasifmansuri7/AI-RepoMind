"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useChatStore } from "@/store/chatStore";
import { Sidebar } from "@/components/Sidebar";
import { RepoIngestionModal } from "@/components/RepoIngestionModal";
import { Code2, MessageSquare, Network } from "lucide-react";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isAuthLoading, initializeAuth, currentSessionId } = useChatStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isIngestOpen, setIsIngestOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (!isAuthLoading && !isLoggedIn) {
      router.push("/login");
    }
  }, [isLoggedIn, isAuthLoading, router]);

  if (!mounted || isAuthLoading || !isLoggedIn) {
    return (
      <div className="flex h-screen overflow-hidden bg-[var(--background)]">
        {/* Sidebar Skeleton */}
        <div className="w-72 glass border-r border-white/5 flex flex-col p-4 space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-white/5 animate-shimmer" />
            <div className="h-6 w-32 bg-white/5 rounded-md animate-shimmer" />
          </div>
          <div className="space-y-3">
            <div className="h-4 w-24 bg-white/5 rounded-md animate-shimmer" />
            <div className="h-12 w-full bg-white/5 rounded-xl animate-shimmer" />
          </div>
          <div className="space-y-3 flex-1 mt-4">
            <div className="h-4 w-24 bg-white/5 rounded-md animate-shimmer" />
            <div className="h-10 w-full bg-white/5 rounded-lg animate-shimmer" />
            <div className="h-16 w-full bg-white/5 rounded-lg animate-shimmer" />
            <div className="h-16 w-full bg-white/5 rounded-lg animate-shimmer" />
            <div className="h-16 w-full bg-white/5 rounded-lg animate-shimmer" />
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="flex-1 flex flex-col p-6">
          <div className="max-w-4xl mx-auto w-full space-y-8 flex-1 mt-10">
            <div className="flex gap-4 w-full">
               <div className="w-10 h-10 rounded-full bg-white/5 animate-shimmer shrink-0" />
               <div className="h-20 w-3/4 bg-white/5 rounded-xl animate-shimmer" />
            </div>
            <div className="flex gap-4 w-full justify-end">
               <div className="h-16 w-1/2 bg-white/5 rounded-xl animate-shimmer" />
               <div className="w-10 h-10 rounded-full bg-white/5 animate-shimmer shrink-0" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden relative">
      <Sidebar onOpenIngest={() => setIsIngestOpen(true)} />
      
      <div className="flex-1 flex flex-col bg-[var(--background)]">
        {/* Top Navigation Bar */}
        {currentSessionId && (
          <div className="flex items-center justify-center border-b border-white/5 bg-black/10 py-2">
            <div className="flex bg-white/5 p-1 rounded-lg">
              <Link
                href="/chat"
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  pathname === "/chat" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </Link>
              <Link
                href="/editor"
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  pathname === "/editor" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Code2 className="w-4 h-4" />
                Editor
              </Link>
              <Link
                href="/architecture"
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  pathname === "/architecture" 
                    ? "bg-white/10 text-white shadow-sm" 
                    : "text-gray-400 hover:text-white"
                }`}
              >
                <Network className="w-4 h-4" />
                Architecture
              </Link>
            </div>
          </div>
        )}
        
        {/* Main Content Area */}
        {children}
      </div>
      
      <RepoIngestionModal isOpen={isIngestOpen} onClose={() => setIsIngestOpen(false)} />
    </div>
  );
}
