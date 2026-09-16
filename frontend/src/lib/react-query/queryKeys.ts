export const queryKeys = {
  repos: () => ["repos"] as const,
  sessions: (search?: string, repoFilter?: string) => 
    ["sessions", search, repoFilter] as const,
  messages: (sessionId: string) => ["messages", sessionId] as const,
  fileTree: (repoId: string) => ["fileTree", repoId] as const,
  fileContent: (repoId: string, path: string) => 
    ["fileContent", repoId, path] as const,
  architecture: (repoId: string) => ["architecture", repoId] as const,
};
