"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Download, Check, Wand2, Loader2, AlertCircle } from "lucide-react";
import apiClient from "@/utils/apiClient";
import ReactMarkdown from "react-markdown";

type ContextRulesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  repoId: string;
  repoName: string;
};

export function ContextRulesModal({ isOpen, onClose, repoId, repoName }: ContextRulesModalProps) {
  const [rules, setRules] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>(".cursorrules");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<"cursor" | "windsurf" | "copilot" | "generic" | "antigravity">("cursor");

  useEffect(() => {
    if (isOpen) {
      setRules(null);
      setError(null);
      setCopied(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, repoId]);

  const generateRules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(`/api/repos/${encodeURIComponent(repoId)}/rules?format=${selectedFormat}`);
      setRules(res.data.rules);
      setFilename(res.data.filename);
    } catch (err: unknown) {
      console.error(err);
      let errMsg = "Failed to generate context rules. Make sure the repository contains tech stack files (like package.json, requirements.txt, etc).";
      if (err && typeof err === 'object' && 'response' in err) {
        const responseError = err as { response?: { data?: { detail?: string } } };
        errMsg = responseError.response?.data?.detail || errMsg;
      } else if (err instanceof Error) {
        errMsg = err.message || errMsg;
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (rules) {
      navigator.clipboard.writeText(rules);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (rules) {
      const blob = new Blob([rules], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-4xl max-h-[85vh] bg-[#0f111a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden glass-card"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <Wand2 className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-white">Context Rules</h2>
                  <p className="text-xs text-gray-400">Generated for {repoName}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Format Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-white/10 bg-black/40">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                {[
                  { id: "cursor", label: "Cursor" },
                  { id: "windsurf", label: "Windsurf" },
                  { id: "copilot", label: "GitHub Copilot" },
                  { id: "antigravity", label: "Antigravity" },
                  { id: "generic", label: "Generic MD" }
                ].map((format) => (
                  <button
                    key={format.id}
                    onClick={() => {
                      setSelectedFormat(format.id as any);
                      setRules(null); // Clear rules when changing format to prompt regeneration
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                      selectedFormat === format.id 
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" 
                        : "bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-gray-300"
                    }`}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
              <button
                onClick={generateRules}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition shadow-lg shadow-purple-500/20 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {rules ? "Regenerate" : "Generate Rules"}
              </button>
            </div>
                
            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-black/20">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-xl animate-pulse" />
                    <Loader2 className="w-10 h-10 text-purple-400 animate-spin relative" />
                  </div>
                  <p className="text-gray-400 text-sm animate-pulse">Analyzing tech stack and generating rules...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
                  <AlertCircle className="w-12 h-12 text-red-400" />
                  <p className="text-red-400 max-w-md">{error}</p>
                </div>
              ) : rules ? (
                <div className="prose prose-invert prose-purple max-w-none">
                  <ReactMarkdown>{rules}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
                  <div className="p-4 bg-purple-500/10 rounded-full">
                    <Wand2 className="w-12 h-12 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white">Ready to generate</h3>
                  <p className="text-gray-400 max-w-sm text-sm">Select your preferred AI assistant format above and click Generate to create tailored instructions.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="text-xs text-gray-500 max-w-sm">
                Save this file as <code className="bg-black/30 px-1 py-0.5 rounded text-gray-300">
                  {selectedFormat === 'copilot' ? '.github/copilot-instructions.md' : filename}
                </code> in your project root to align your AI assistant with the repository.
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopy}
                  disabled={loading || !rules}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={loading || !rules}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
                >
                  <Download className="w-4 h-4" />
                  Download {filename}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
