import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  File, 
  FileCode2, 
  FileText, 
  FileJson,
  Loader2
} from 'lucide-react';
import { FileNode, useEditorStore } from '@/store/editorStore';
import { useFileTree } from '@/hooks/useEditor';

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'go':
    case 'rs':
      return <FileCode2 className="w-4 h-4 text-blue-400 shrink-0" />;
    case 'json':
      return <FileJson className="w-4 h-4 text-yellow-400 shrink-0" />;
    case 'md':
    case 'txt':
      return <FileText className="w-4 h-4 text-gray-400 shrink-0" />;
    default:
      return <File className="w-4 h-4 text-gray-400 shrink-0" />;
  }
};

const FileTreeNode = ({ 
  node, 
  repoId, 
  depth = 0 
}: { 
  node: FileNode; 
  repoId: string;
  depth?: number 
}) => {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const { activeFile, setActiveFile } = useEditorStore();

  const isDir = node.type === 'directory';
  const isActive = activeFile === node.path;

  const handleToggle = () => {
    if (isDir) {
      setIsOpen(!isOpen);
    } else {
      setActiveFile(node.path);
    }
  };

  return (
    <div className="select-none">
      <div 
        onClick={handleToggle}
        className={`flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer transition-colors text-sm
          ${isActive ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-300 hover:bg-white/5'}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          isOpen ? <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
        ) : (
          <div className="w-4 shrink-0" />
        )}
        
        {isDir ? (
          <Folder className={`w-4 h-4 shrink-0 ${isOpen ? 'text-indigo-400' : 'text-gray-400'}`} />
        ) : (
          getFileIcon(node.name)
        )}
        
        <span className="truncate">{node.name}</span>
      </div>

      {isDir && (
        <AnimatePresence initial={false}>
          {isOpen && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {node.children.map((child, idx) => (
                <FileTreeNode 
                  key={`${child.path}-${idx}`} 
                  node={child} 
                  repoId={repoId}
                  depth={depth + 1} 
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export function FileExplorer({ repoId }: { repoId: string }) {
  const { data: fileTree, isLoading: isTreeLoading, error } = useFileTree(repoId);

  if (isTreeLoading) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-400 text-sm">
        Failed to load file tree
      </div>
    );
  }

  if (!fileTree) {
    return (
      <div className="p-4 text-gray-500 text-sm text-center">
        No files to display.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-2 custom-scrollbar">
      <FileTreeNode node={fileTree} repoId={repoId} />
    </div>
  );
}
