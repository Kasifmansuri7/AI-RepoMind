import { useEffect } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useChatStore } from '@/store/chatStore';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './CodeEditor';

export function EditorView() {
  const { currentSessionId, sessions } = useChatStore();
  const { fetchFileTree } = useEditorStore();
  
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const repoId = currentSession?.repo_id;

  useEffect(() => {
    if (repoId) {
      fetchFileTree(repoId);
    }
  }, [repoId, fetchFileTree]);

  if (!repoId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 bg-[var(--background)]">
        <div className="p-4 bg-white/5 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <p className="text-sm">Select or create a chat session to open its repository in the editor.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-row h-full overflow-hidden bg-[var(--background)]">
      {/* Sidebar: File Explorer */}
      <div className="w-64 border-r border-white/5 bg-[#18181b] flex flex-col">
        <div className="p-3 border-b border-white/5 bg-black/20">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Explorer</h3>
        </div>
        <div className="flex-1 overflow-hidden">
          <FileExplorer repoId={repoId} />
        </div>
      </div>
      
      {/* Main Area: Code Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        <CodeEditor repoId={repoId} />
      </div>
    </div>
  );
}
