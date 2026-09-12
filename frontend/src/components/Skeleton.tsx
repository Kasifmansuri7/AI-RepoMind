export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-white/5 rounded-md animate-shimmer border border-white/5 ${className}`}
    />
  );
}
