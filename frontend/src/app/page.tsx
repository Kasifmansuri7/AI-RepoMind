"use client";

import { useEffect, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { LoginScreen } from "@/components/LoginScreen";
import { Sidebar } from "@/components/Sidebar";
import { ChatArea } from "@/components/ChatArea";

export default function Home() {
  const { isLoggedIn } = useChatStore();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch with Zustand persist by waiting for mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!isLoggedIn) {
    return <LoginScreen />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <ChatArea />
    </div>
  );
}
