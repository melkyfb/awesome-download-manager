export function AppBackground({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-gradient)', minHeight: '100vh', transition: 'background 0.4s ease' }}>
      {children}
    </div>
  )
}
