"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { ChatArea } from "@/components/ChatArea";
import { useChatStore } from "@/store/chatStore";

export default function ChatPage() {
  const params = useParams();
  
  // params.chatId will be an array because of [...chatId]
  // if we go to /chat, it will be undefined or empty array
  // if we go to /chat/123, it will be ["123"]
  
  const chatIdArray = params?.chatId as string[] | undefined;
  const chatId = chatIdArray?.[0] || null;
  
  const setCurrentSessionId = useChatStore((state) => state.setCurrentSessionId);

  useEffect(() => {
    if (chatId) {
      if (chatId !== useChatStore.getState().currentSessionId) {
        setCurrentSessionId(chatId);
      }
    } else {
      if (useChatStore.getState().currentSessionId !== null) {
        setCurrentSessionId(null);
      }
    }
  }, [chatId, setCurrentSessionId]);

  return <ChatArea />;
}
