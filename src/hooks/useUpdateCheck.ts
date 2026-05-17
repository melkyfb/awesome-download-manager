import { useState, useEffect } from 'react'
import { getVersion } from '@tauri-apps/api/app'

export interface GithubRelease {
  tag_name: string
  name: string
  body: string
  published_at: string
  html_url: string
}

interface UpdateState {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releases: GithubRelease[]
  loading: boolean
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [lMaj, lMin, lPat] = parse(latest)
  const [cMaj, cMin, cPat] = parse(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

const REPO = 'melkyfb/awesome-download-manager'

export function useUpdateCheck(): UpdateState {
  const [state, setState] = useState<UpdateState>({
    currentVersion: '',
    latestVersion: '',
    hasUpdate: false,
    releases: [],
    loading: true,
  })

  useEffect(() => {
    async function check() {
      try {
        const [current, res] = await Promise.all([
          getVersion(),
          fetch(`https://api.github.com/repos/${REPO}/releases`),
        ])

        if (!res.ok) {
          setState(s => ({ ...s, currentVersion: current, loading: false }))
          return
        }

        const releases: GithubRelease[] = await res.json()
        const latest = releases[0]?.tag_name ?? ''
        const latestClean = latest.replace(/^v/, '')
        const hasUpdate = latestClean !== '' && isNewer(latestClean, current)

        setState({ currentVersion: current, latestVersion: latestClean, hasUpdate, releases, loading: false })
      } catch {
        setState(s => ({ ...s, loading: false }))
      }
    }

    check()
  }, [])

  return state
}
