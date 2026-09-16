import { useEffect, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useChatStore } from '@/store/chatStore';
import { useSessions } from '@/hooks/useSessions';
import { useRepos } from '@/hooks/useRepos';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './CodeEditor';
import { SourceControlPanel } from './SourceControlPanel';
import { FolderGit2, GitBranch } from 'lucide-react';

export function EditorView() {
  const { currentSessionId, tenantId } = useChatStore();
  const { modifiedFiles } = useEditorStore();
  const [activeTab, setActiveTab] = useState<'files' | 'source_control'>('files');
  
  const { data: sessionsData } = useSessions(tenantId);
  const sessions = sessionsData?.pages.flatMap(p => p.items) || [];
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const repoId = currentSession?.repo_id;

  const { data: repos = [] } = useRepos();
  const currentRepo = repos.find(r => r.id === repoId || r.name === repoId);
  const isGithubRepo = currentRepo?.url?.startsWith('https://github.com/');
  const modifiedCount = Object.keys(modifiedFiles).length;

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
      {/* Sidebar */}
      <div className="w-64 border-r border-white/5 bg-[#18181b] flex flex-col">
        {isGithubRepo ? (
          <div className="flex border-b border-white/5 bg-black/20">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 flex items-center justify-center gap-2 p-3 text-xs font-semibold uppercase tracking-wider transition-colors
                ${activeTab === 'files' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}
              `}
            >
              <FolderGit2 className="w-4 h-4" />
              Files
            </button>
            <button
              onClick={() => setActiveTab('source_control')}
              className={`flex-1 flex items-center justify-center gap-2 p-3 text-xs font-semibold uppercase tracking-wider transition-colors
                ${activeTab === 'source_control' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 hover:text-gray-300'}
              `}
            >
              <GitBranch className="w-4 h-4" />
              Changes {modifiedCount > 0 && <span className="bg-indigo-500/20 text-indigo-400 px-1.5 rounded-full">{modifiedCount}</span>}
            </button>
          </div>
        ) : (
          <div className="p-3 border-b border-white/5 bg-black/20">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              <FolderGit2 className="w-4 h-4" /> Explorer
            </h3>
          </div>
        )}
        
        <div className="flex-1 overflow-hidden">
          {activeTab === 'files' ? (
            <FileExplorer repoId={repoId} />
          ) : (
            <SourceControlPanel repoId={repoId} />
          )}
        </div>
      </div>
      
      {/* Main Area: Code Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        <CodeEditor repoId={repoId} />
      </div>
    </div>
  );
}
