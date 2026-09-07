"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { LoginScreen } from "@/components/LoginScreen";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";
import { RepoIngestionModal } from "@/components/RepoIngestionModal";

export default function Home() {
  const { isLoggedIn, initializeAuth } = useChatStore();
  const [mounted, setMounted] = useState(false);
  const [isIngestOpen, setIsIngestOpen] = useState(false);

  // Prevent hydration mismatch with Zustand persist by waiting for mount
  useEffect(() => {
    setMounted(true);
    initializeAuth();
  }, [initializeAuth]);

  if (!mounted) return null;

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
