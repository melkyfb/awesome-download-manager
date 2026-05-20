import { describe, it, expect } from 'vitest'
import { isVideoUrl, isPlaylistUrl } from './videoUrls'

describe('isVideoUrl', () => {
  it('detects youtube.com', () => {
    expect(isVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
  })
  it('detects youtu.be', () => {
    expect(isVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true)
  })
  it('detects tiktok.com', () => {
    expect(isVideoUrl('https://www.tiktok.com/@user/video/123')).toBe(true)
  })
  it('detects vm.tiktok.com', () => {
    expect(isVideoUrl('https://vm.tiktok.com/abc123/')).toBe(true)
  })
  it('detects instagram.com', () => {
    expect(isVideoUrl('https://www.instagram.com/reel/abc123/')).toBe(true)
  })
  it('detects facebook.com', () => {
    expect(isVideoUrl('https://www.facebook.com/video/123')).toBe(true)
  })
  it('detects fb.watch', () => {
    expect(isVideoUrl('https://fb.watch/abc123/')).toBe(true)
  })
  it('ignores regular downloads', () => {
    expect(isVideoUrl('https://example.com/file.zip')).toBe(false)
  })
  it('ignores invalid URLs', () => {
    expect(isVideoUrl('not a url')).toBe(false)
  })
})

describe('isPlaylistUrl', () => {
  it('detects youtube.com playlist URL', () => {
    expect(isPlaylistUrl('https://www.youtube.com/playlist?list=PLabc123')).toBe(true)
  })
  it('detects youtube.com watch URL with list param', () => {
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123')).toBe(true)
  })
  it('returns false for single youtube video', () => {
    expect(isPlaylistUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
  })
  it('returns false for non-youtube URL', () => {
    expect(isPlaylistUrl('https://tiktok.com/@user/video/123')).toBe(false)
  })
  it('returns false for invalid URL', () => {
    expect(isPlaylistUrl('not a url')).toBe(false)
  })
})
