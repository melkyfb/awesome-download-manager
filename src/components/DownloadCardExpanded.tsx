import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import type { Download } from '../types'

function AiButton({ label, disabled }: { label: string; disabled: boolean }) {
  return (
    <button
      disabled={disabled}
      title={disabled ? 'Configure uma API key de IA nas Configurações para usar esta função' : undefined}
      className={`
        text-xs px-3 py-1 rounded border flex items-center gap-1
        ${disabled
          ? 'opacity-40 cursor-not-allowed bg-gray-100 text-gray-400 border-gray-200'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }
      `}
    >
      {label}
      {disabled && <span className="text-amber-500 font-bold">!</span>}
    </button>
  )
}

export function DownloadCardExpanded({ download }: { download: Download }) {
  const aiEnabled = useSelector((s: RootState) => s.config.ai_enabled)

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(console.error)
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
      {/* SHA256 */}
      {download.sha256 && (
        <div className="mb-3">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">SHA256</span>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 truncate max-w-xs">
              {download.sha256}
            </code>
            <button onClick={() => copyToClipboard(download.sha256!)} className="text-xs text-blue-600 hover:text-blue-800">Copy</button>
            <a
              href={`https://www.virustotal.com/gui/file/${download.sha256}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              VirusTotal →
            </a>
          </div>
        </div>
      )}

      {/* AI Actions */}
      <div className="flex flex-wrap gap-2 mb-3">
        <AiButton label="AI Summary" disabled={!aiEnabled} />
        <AiButton label="Check Malware" disabled={!aiEnabled} />
        <AiButton label="Find Mirrors" disabled={!aiEnabled} />
      </div>

      {/* AI Gate Banner */}
      {!aiEnabled && (
        <div className="flex items-center gap-2 bg-amber-50 border-l-4 border-amber-400 rounded px-3 py-2 text-xs text-amber-800">
          <span className="font-bold">!</span>
          <span>
            Funções de IA desativadas.{' '}
            <button className="underline text-blue-600 hover:text-blue-800">Configurar →</button>
          </span>
        </div>
      )}

      {/* URL */}
      <div className="mt-2 text-xs text-gray-400 truncate">{download.url}</div>
    </div>
  )
}
