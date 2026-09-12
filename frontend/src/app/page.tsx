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

  // Prevent hydration mismatch with Zustand persist by waiting for mount
  useEffect(() => {
    setMounted(true);
    initializeAuth();
  }, [initializeAuth]);

  if (!mounted || isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
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
