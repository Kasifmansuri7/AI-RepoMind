import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  language: string;
  value: string;
}

export function CodeBlock({ language, value }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="not-prose rounded-xl overflow-hidden border border-white/10 bg-[#1e1e1e] my-4 shadow-lg group">
      <div className="flex items-center justify-between px-4 py-2 bg-[#181818] border-b border-white/5">
        <span className="text-xs font-medium text-gray-400 lowercase">{language || "text"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/5"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100" />}
          {copied ? <span className="text-green-400">Copied!</span> : <span className="opacity-70 group-hover:opacity-100">Copy</span>}
        </button>
      </div>
      <div className="overflow-x-auto text-[13px] leading-relaxed">
        <SyntaxHighlighter
          language={language || "text"}
          style={vscDarkPlus}
          customStyle={{ margin: 0, padding: '1.25rem', background: 'transparent' }}
          wrapLongLines={true}
        >
          {value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
