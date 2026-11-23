import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout.jsx'
import { AppProvider } from './context/AppContext.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import InterviewRoomPage from './pages/InterviewRoomPage.jsx'
import NewInterviewPage from './pages/NewInterviewPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import PerformancePage from './pages/PerformancePage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

const TITLES = {
  '/': 'Dashboard',
  '/interview/new': 'Start interview',
  '/history': 'Interview history',
  '/performance': 'Performance',
  '/settings': 'Settings',
}

function useDocumentTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const page =
      TITLES[pathname] ??
      (pathname.startsWith('/results/') ? 'Results' : pathname.startsWith('/interview/') ? 'Interview' : 'Not found')
    document.title = `${page} | InterviewIQ`
    window.scrollTo(0, 0)
  }, [pathname])
}

export default function App() {
  useDocumentTitle()
  return (
    <AppProvider>
      <Routes>
        {/* Focus mode: the interview room has no sidebar */}
        <Route path="/interview/:sessionId" element={<InterviewRoomPage />} />

        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="interview/new" element={<NewInterviewPage />} />
          <Route path="results/:sessionId" element={<ResultsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="performance" element={<PerformancePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AppProvider>
  )
}
