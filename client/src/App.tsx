import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { DashboardPage } from './pages/Dashboard'
import { WorkspacePage } from './pages/Workspace'
import { SettingsPage } from './pages/Settings'
import { connectServerLogs, addClientLog } from './lib/serverLogs'

export function App() {
  useEffect(() => {
    addClientLog('App', 'mount effect - connecting server logs')
    connectServerLogs()
    addClientLog('App', 'server logs connected')
  }, [])
  
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/workspace/:projectId" element={<WorkspacePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
