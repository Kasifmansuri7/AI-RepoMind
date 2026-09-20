"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatArea } from "@/components/ChatArea";
import { useChatStore } from "@/store/chatStore";

export default function ChatPage() {
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && currentSessionId) {
      router.replace(`/chat/${currentSessionId}`);
    }
  }, [currentSessionId, router, isClient]);

  // Don't render ChatArea if we are about to redirect
  if (isClient && currentSessionId) {
    return null;
  }

  return <ChatArea />;
}
