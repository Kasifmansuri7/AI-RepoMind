import { useEditorStore } from '@/store/editorStore';
import { useRepos } from '@/hooks/useRepos';
import { useBulkCommit } from '@/hooks/useEditor';
import { Undo2, Save, FileCode2 } from 'lucide-react';
import { useState } from 'react';
import { CommitModal } from './CommitModal';

export function SourceControlPanel({ repoId }: { repoId: string }) {
  const { modifiedFiles, revertFile, setActiveFile, clearModifiedFiles } = useEditorStore();
  const { data: repos = [] } = useRepos();
  const bulkCommitMutation = useBulkCommit();
  const [showCommitModal, setShowCommitModal] = useState(false);
  
  const currentRepo = repos.find(r => r.id === repoId || r.name === repoId);
  const isGithubRepo = currentRepo?.url?.startsWith('https://github.com/');

  const files = Object.keys(modifiedFiles);
  
  if (!isGithubRepo) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-white/5 bg-black/20 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Source Control</h3>
        {files.length > 0 && (
          <span className="text-xs bg-indigo-500/20 text-indigo-400 px-1.5 rounded-full">{files.length}</span>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <FileCode2 className="w-6 h-6 mb-2 opacity-50" />
            <p className="text-xs text-center">No staged changes</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {files.map(path => (
              <li key={path} className="flex items-center justify-between group rounded hover:bg-white/5 px-2 py-1.5 cursor-pointer">
                <span 
                  className="text-sm text-gray-300 truncate mr-2 flex-1"
                  onClick={() => setActiveFile(path)}
                  title={path}
                >
                  {path.split('/').pop()}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    revertFile(path);
                  }}
                  className="text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-1"
                  title="Revert Change"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {files.length > 0 && (
        <div className="p-3 border-t border-white/5">
          <button
            onClick={() => setShowCommitModal(true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            Commit All
          </button>
        </div>
      )}

      <CommitModal 
        repoId={repoId}
        isOpen={showCommitModal}
        isCommitting={bulkCommitMutation.isPending}
        onClose={() => setShowCommitModal(false)}
        onConfirm={async (message) => {
          // Prepare the files for bulk commit
          const filesContent: Record<string, string> = {};
          for (const [path, diff] of Object.entries(modifiedFiles)) {
            filesContent[path] = diff.current;
          }
          await bulkCommitMutation.mutateAsync({ repoId, message, files: filesContent });
          clearModifiedFiles();
          setShowCommitModal(false);
        }}
      />
    </div>
  );
}
