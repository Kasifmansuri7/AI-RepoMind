"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ChatArea } from "@/components/ChatArea";
import { useChatStore } from "@/store/chatStore";

export default function ChatSessionPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params);
  const setCurrentSessionId = useChatStore((state) => state.setCurrentSessionId);
  const currentSessionId = useChatStore((state) => state.currentSessionId);

  useEffect(() => {
    if (chatId && chatId !== useChatStore.getState().currentSessionId) {
      setCurrentSessionId(chatId);
    }
  }, [chatId, setCurrentSessionId]);

  return <ChatArea />;
}
