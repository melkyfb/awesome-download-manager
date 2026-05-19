const VIDEO_HOSTS = [
  'tiktok.com',
  'vm.tiktok.com',
  'instagram.com',
  'facebook.com',
  'fb.watch',
  'youtube.com',
  'youtu.be',
  'm.youtube.com',
]

export function isVideoUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return VIDEO_HOSTS.some(host => hostname === host || hostname.endsWith('.' + host))
  } catch {
    return false
  }
}

export const VIDEO_QUALITY_OPTIONS = [
  { value: 'best',  label: 'Melhor qualidade' },
  { value: '1080p', label: '1080p' },
  { value: '720p',  label: '720p' },
  { value: '480p',  label: '480p' },
  { value: 'audio', label: 'Áudio MP3' },
] as const

export type VideoQuality = typeof VIDEO_QUALITY_OPTIONS[number]['value']
