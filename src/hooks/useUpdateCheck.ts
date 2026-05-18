import { useState, useEffect } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { check, type Update } from '@tauri-apps/plugin-updater'

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
  update: Update | null
}

const REPO = 'melkyfb/awesome-download-manager'

export function useUpdateCheck(): UpdateState {
  const [state, setState] = useState<UpdateState>({
    currentVersion: '',
    latestVersion: '',
    hasUpdate: false,
    releases: [],
    loading: true,
    update: null,
  })

  useEffect(() => {
    async function run() {
      try {
        const [current, updateResult, releasesRes] = await Promise.all([
          getVersion(),
          check().catch(() => null),
          fetch(`https://api.github.com/repos/${REPO}/releases`).then(r => r.ok ? r.json() : []).catch(() => []),
        ])

        const releases: GithubRelease[] = releasesRes
        const latest = updateResult?.version ?? releases[0]?.tag_name?.replace(/^v/, '') ?? ''

        setState({
          currentVersion: current,
          latestVersion: latest,
          hasUpdate: updateResult?.available ?? false,
          releases,
          loading: false,
          update: updateResult,
        })
      } catch {
        setState(s => ({ ...s, loading: false }))
      }
    }
    run()
  }, [])

  return state
}
