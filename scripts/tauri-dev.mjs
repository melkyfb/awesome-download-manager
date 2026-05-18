import { execSync, spawnSync } from 'child_process'

let version = '0.0.0-dev'
try {
  const tag = execSync('git describe --tags --abbrev=0').toString().trim()
  version = tag.replace(/^v/, '') + '-dev'
} catch {}

console.log(`[dev] version: ${version}`)

const result = spawnSync(
  'npx',
  ['tauri', 'dev', '--config', JSON.stringify({ version })],
  { stdio: 'inherit', shell: process.platform === 'win32' }
)
process.exit(result.status ?? 0)
