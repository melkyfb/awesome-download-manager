import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import { getFont } from '../fonts'

export function FontProvider({ children }: { children: React.ReactNode }) {
  const fontId = useSelector((s: RootState) => s.appearance.fontId)
  const linkRef = useRef<HTMLLinkElement | null>(null)

  useEffect(() => {
    const font = getFont(fontId)
    const url = `https://fonts.googleapis.com/css2?family=${font.googleParams}&display=swap`

    if (linkRef.current) {
      linkRef.current.href = url
    } else {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      document.head.appendChild(link)
      linkRef.current = link
    }

    document.body.style.fontFamily = font.family
  }, [fontId])

  return <>{children}</>
}
