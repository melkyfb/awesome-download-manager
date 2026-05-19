import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import GitHubIcon from '@mui/icons-material/GitHub'
import LinkedInIcon from '@mui/icons-material/LinkedIn'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import { openUrl } from '@tauri-apps/plugin-opener'

const PROJECT_GITHUB = 'https://github.com/melkyfb/awesome-download-manager'
const LICENSE_URL = 'https://github.com/melkyfb/awesome-download-manager/blob/master/LICENSE'

const TECH_TAGS = [
  'Open Source', 'React 19', 'Tauri v2', 'MUI v9', 'Redux Toolkit',
  'TypeScript', 'Rust', 'i18next', 'Vite',
]

const THIRD_PARTIES = [
  { name: 'React', description: 'UI library', url: 'https://react.dev' },
  { name: 'MUI (Material UI)', description: 'Component library', url: 'https://mui.com' },
  { name: 'Redux Toolkit', description: 'State management', url: 'https://redux-toolkit.js.org' },
  { name: 'Tauri', description: 'Desktop & mobile runtime', url: 'https://tauri.app' },
  { name: 'i18next', description: 'Internationalization', url: 'https://www.i18next.com' },
  { name: 'Vite', description: 'Build tool', url: 'https://vitejs.dev' },
  { name: 'Emotion', description: 'CSS-in-JS engine', url: 'https://emotion.sh' },
  { name: 'Vitest', description: 'Testing framework', url: 'https://vitest.dev' },
]

function openLink(url: string) {
  openUrl(url).catch(console.error)
}

export function AboutScreen() {
  return (
    <Box sx={{ maxWidth: 680, mx: 'auto', px: 2, py: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* Project header */}
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Awesome Download Manager
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Gerenciador de downloads para desktop e Android, com suporte a múltiplos chunks, FTP,
          verificação SHA256, integração com IA e temas personalizados.
        </Typography>
      </Box>

      {/* Tags */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {TECH_TAGS.map(tag => (
          <Chip key={tag} label={tag} size="small" variant="outlined" />
        ))}
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          startIcon={<GitHubIcon />}
          onClick={() => openLink(PROJECT_GITHUB)}
        >
          GitHub
        </Button>
        <Button
          variant="outlined"
          startIcon={<OpenInNewRoundedIcon />}
          onClick={() => openLink(LICENSE_URL)}
        >
          Licença MIT
        </Button>
      </Box>

      <Divider />

      {/* Third-party libs */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
          Tecnologias utilizadas
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {THIRD_PARTIES.map(lib => (
            <Box
              key={lib.name}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', '&:hover': { opacity: 0.8 } }}
              onClick={() => openLink(lib.url)}
            >
              <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 160 }}>{lib.name}</Typography>
              <Typography variant="body2" color="text.secondary">{lib.description}</Typography>
              <OpenInNewRoundedIcon sx={{ fontSize: 14, ml: 'auto', color: 'text.disabled' }} />
            </Box>
          ))}
        </Box>
      </Box>

      <Divider />

      {/* Developer contact card */}
      <Paper variant="outlined" sx={{ borderRadius: 3, p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
          Desenvolvedor
        </Typography>
        <Typography variant="body1" sx={{ fontWeight: 600 }}>Melky Salem</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Full Stack Developer
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<GitHubIcon />}
            onClick={() => openLink('https://github.com/melkyfb')}
          >
            melkyfb
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<LinkedInIcon />}
            onClick={() => openLink('https://linkedin.com/in/devsalem')}
          >
            devsalem
          </Button>
        </Box>
      </Paper>

    </Box>
  )
}
