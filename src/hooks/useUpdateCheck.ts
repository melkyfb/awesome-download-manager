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

export function useUpdateCheck() {
  const [state, setState] = useState<UpdateState>({
    currentVersion: '',
    latestVersion: '',
    hasUpdate: false,
    releases: [],
    loading: true,
    update: null,
  })

  async function runCheck(): Promise<{ hasUpdate: boolean }> {
    setState(s => ({ ...s, loading: true }))
    try {
      const [current, updateResult, releasesRes] = await Promise.all([
        getVersion(),
        check().catch(() => null),
        fetch(`https://api.github.com/repos/${REPO}/releases`).then(r => r.ok ? r.json() : []).catch(() => []),
      ])

      const releases: GithubRelease[] = releasesRes
      const latest = updateResult?.version ?? releases[0]?.tag_name?.replace(/^v/, '') ?? ''
      const hasUpdate = updateResult?.available ?? false

      setState(s => ({
        ...s,
        currentVersion: current || s.currentVersion,
        latestVersion: latest,
        hasUpdate,
        releases,
        loading: false,
        update: updateResult,
      }))
      return { hasUpdate }
    } catch {
      setState(s => ({ ...s, loading: false }))
      return { hasUpdate: false }
    }
  }

  useEffect(() => { runCheck() }, [])

  return { ...state, checkNow: runCheck }
}
