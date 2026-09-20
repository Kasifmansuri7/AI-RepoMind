"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChatArea } from "@/components/ChatArea";
import { useChatStore } from "@/store/chatStore";

export default function ChatPage() {
  const params = useParams();
  const chatIdArray = params?.chatId as string[] | undefined;
  const chatId = chatIdArray?.[0];
  
  const setCurrentSessionId = useChatStore((state) => state.setCurrentSessionId);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    
    if (chatId) {
      if (chatId !== useChatStore.getState().currentSessionId) {
        setCurrentSessionId(chatId);
      }
    } else {
      if (currentSessionId) {
        router.replace(`/chat/${currentSessionId}`);
      }
    }
  }, [chatId, currentSessionId, setCurrentSessionId, router, isClient]);

  return <ChatArea />;
}
