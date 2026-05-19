import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import type { ReactNode } from 'react'

interface Props {
  title: string
  onMenuClick: () => void
  actions?: ReactNode
}

export function TopBar({ title, onMenuClick, actions }: Props) {
  return (
    <AppBar position="static" color="transparent" elevation={0}
      sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar>
        <IconButton edge="start" onClick={onMenuClick} aria-label="menu" sx={{ mr: 1 }}>
          <MenuRoundedIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
          {title}
        </Typography>
        {actions}
      </Toolbar>
    </AppBar>
  )
}
