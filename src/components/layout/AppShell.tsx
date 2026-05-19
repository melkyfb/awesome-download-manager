import { useState } from 'react'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import { TopBar } from './TopBar'
import { DrawerContent } from './DrawerContent'

const DRAWER_WIDTH = 240

interface Props {
  title: string
  children: ReactNode
  topBarActions?: ReactNode
  hasUpdate?: boolean
  onUpdate?: () => void
}

export function AppShell({ title, children, topBarActions, hasUpdate, onUpdate }: Props) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      {/* Permanent desktop sidebar */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          <DrawerContent hasUpdate={hasUpdate} onUpdate={onUpdate} />
        </Drawer>
      )}

      {/* Temporary mobile drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
        >
          <DrawerContent onNavigate={() => setDrawerOpen(false)} hasUpdate={hasUpdate} onUpdate={onUpdate} />
        </Drawer>
      )}

      {/* Main content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar
          title={title}
          onMenuClick={isMobile ? () => setDrawerOpen(true) : undefined}
          actions={topBarActions}
        />
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
