import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router'
import { AuthProvider } from './lib/AuthContext'
import { ChatUIProvider } from './lib/ChatUIContext'
import { ProtectedRoute } from './lib/ProtectedRoute'
import { FloatingChatWindows } from './components/layout/FloatingChatWindows'
import { GlobalChatListener } from './components/layout/GlobalChatListener'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { DashboardPage } from './pages/DashboardPage'
import { AdminPage } from './pages/AdminPage'
import { FacilitatorPage } from './pages/FacilitatorPage'
import { PlayerPage } from './pages/PlayerPage'
import { CoachPage } from './pages/CoachPage'
import { OrganizerPage } from './pages/OrganizerPage'
import { ProfilePage } from './pages/ProfilePage'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ChatUIProvider>
          <GlobalChatListener />
          <FloatingChatWindows />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute roles={['admin']}>
                    <AdminPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/facilitator"
                element={
                  <ProtectedRoute roles={['venue_facilitator', 'admin']}>
                    <FacilitatorPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/player"
                element={
                  <ProtectedRoute roles={['player']}>
                    <PlayerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/coach"
                element={
                  <ProtectedRoute roles={['coach']}>
                    <CoachPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizer"
                element={
                  <ProtectedRoute roles={['organizer']}>
                    <OrganizerPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile/:userId"
                element={
                  <ProtectedRoute roles={['player', 'coach']}>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </BrowserRouter>
        </ChatUIProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
