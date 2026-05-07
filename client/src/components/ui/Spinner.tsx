export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 20 20"
      className={className}
      style={{ animation: 'spin 0.7s linear infinite' }}
    >
      <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(235,235,245,0.2)" strokeWidth="2" />
      <circle cx="10" cy="10" r="8" fill="none" stroke="#0a84ff" strokeWidth="2"
        strokeLinecap="round" strokeDasharray="32" strokeDashoffset="24" />
    </svg>
  )
}
