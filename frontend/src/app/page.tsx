"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/store/chatStore";

export default function Home() {
  const { isLoggedIn, isAuthLoading, initializeAuth } = useChatStore();
  const router = useRouter();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    if (!isAuthLoading) {
      if (isLoggedIn) {
        router.replace("/chat");
      } else {
        router.replace("/login");
      }
    }
  }, [isLoggedIn, isAuthLoading, router]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] justify-center items-center">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 rounded-full bg-white/10 mb-4" />
        <div className="h-4 w-24 bg-white/10 rounded-md" />
      </div>
    </div>
  );
}
