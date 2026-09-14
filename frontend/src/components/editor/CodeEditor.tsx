import { useState, SVGProps, useEffect } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useEditorStore } from '@/store/editorStore';
import { useChatStore } from '@/store/chatStore';
import { Save, Copy, Download, Loader2, GitMerge } from 'lucide-react';


export function CodeEditor({ repoId }: { repoId: string }) {
  const { 
    activeFile, 
    fileContent, 
    originalFileContent,
    setFileContent,
    saveFileContent,
    isFileLoading,
    isSaving,
    updateModifiedFile,
    modifiedFiles
  } = useEditorStore();
  
  const { repos } = useChatStore();

  const isDirty = fileContent !== originalFileContent;

  const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit');

  const currentRepo = repos.find(r => r.id === repoId || r.name === repoId);
  const isGithubRepo = currentRepo?.url?.startsWith('https://github.com/');

  // Reset view mode when changing files
  useEffect(() => {
    setViewMode('edit');
  }, [activeFile]);

  const handleSave = async () => {
    if (!activeFile || !isDirty) return;
    
    if (isGithubRepo) {
      updateModifiedFile(activeFile, originalFileContent, fileContent);
      return;
    }
    
    try {
      await saveFileContent(repoId, activeFile, fileContent);
    } catch (e) {
      // Error is handled in the store
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fileContent);
    // Optional: Add toast notification
  };

  const handleDownload = () => {
    if (!activeFile) return;
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLanguage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx': return 'typescript';
      case 'js':
      case 'jsx': return 'javascript';
      case 'py': return 'python';
      case 'json': return 'json';
      case 'md': return 'markdown';
      case 'html': return 'html';
      case 'css': return 'css';
      case 'go': return 'go';
      case 'rs': return 'rust';
      default: return 'plaintext';
    }
  };

  if (!activeFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500">
        <div className="p-4 bg-white/5 rounded-full mb-4">
          <FileCode2Icon className="w-8 h-8" />
        </div>
        <p>Select a file from the explorer to view its contents.</p>
      </div>
    );
  }

  if (isFileLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] border-b border-[#3e3e42]">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span className="font-mono">{activeFile}</span>
          {isDirty && <span className="w-2 h-2 rounded-full bg-yellow-500" title="Unsaved changes"></span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'edit' ? 'diff' : 'edit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors
              ${viewMode === 'diff' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-white/10 text-gray-400 hover:text-white hover:bg-white/20'}
            `}
            title="Toggle Diff View"
          >
            <GitMerge className="w-4 h-4" />
            Diff
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors
              ${isDirty 
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white' 
                : 'bg-white/10 text-gray-500 cursor-not-allowed'}
            `}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isGithubRepo ? "Stage Changes" : "Save"}
          </button>
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'edit' ? (
          <Editor
            height="100%"
            language={getLanguage(activeFile)}
            theme="vs-dark"
            value={fileContent}
            onChange={(value) => setFileContent(value || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          />
        ) : (
          <DiffEditor
            height="100%"
            language={getLanguage(activeFile)}
            theme="vs-dark"
            original={originalFileContent}
            modified={fileContent}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              readOnly: true
            }}
          />
        )}
      </div>
    </div>
  );
}

function FileCode2Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m10 12.5-2 2 2 2" />
      <path d="m14 12.5 2 2-2 2" />
    </svg>
  );
}
