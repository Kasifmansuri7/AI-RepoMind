"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { LoginScreen } from "@/components/LoginScreen";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { RepoIngestionModal } from "@/components/RepoIngestionModal";

export default function Home() {
  const { isLoggedIn, isAuthLoading, initializeAuth } = useChatStore();
  const [mounted, setMounted] = useState(false);
  const [isIngestOpen, setIsIngestOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    initializeAuth();
  }, [initializeAuth]);

  if (!mounted || isAuthLoading) {
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

        {/* Chat Area Skeleton */}
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
            <div className="flex gap-4 w-full">
               <div className="w-10 h-10 rounded-full bg-white/5 animate-shimmer shrink-0" />
               <div className="h-32 w-4/5 bg-white/5 rounded-xl animate-shimmer" />
            </div>
          </div>
          
          {/* Input Skeleton */}
          <div className="max-w-4xl mx-auto w-full mt-auto pt-6">
             <div className="h-14 w-full bg-white/5 rounded-2xl animate-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen overflow-hidden relative">
      <Sidebar onOpenIngest={() => setIsIngestOpen(true)} />
      <ChatArea />
      <RepoIngestionModal isOpen={isIngestOpen} onClose={() => setIsIngestOpen(false)} />
    </div>
  );
}
