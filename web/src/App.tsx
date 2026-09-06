import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router'
import { ThemeProvider } from './lib/ThemeContext'
import { AuthProvider } from './lib/AuthContext'
import { ChatUIProvider } from './lib/ChatUIContext'
import { ProtectedRoute } from './lib/ProtectedRoute'
import { GuestRoute } from './lib/GuestRoute'
import { FloatingChatWindows } from './components/layout/FloatingChatWindows'
import { GlobalChatListener } from './components/layout/GlobalChatListener'
import { PushNotificationsBootstrap } from './components/layout/PushNotificationsBootstrap'
import { LoadingScreen } from './components/layout/LoadingScreen'
import { LandingPage } from './pages/LandingPage'

// Every other route is its own role-specific dashboard (and, via the
// components it renders, pulls in FullCalendar and/or Leaflet — each
// hundreds of KB on its own) — lazy-loading them means a first-time visitor
// landing on "/" only ever downloads the landing page's code, and a logged-
// in user only downloads the one dashboard their role actually needs,
// instead of every role's dashboard shipping in one shared bundle regardless
// of who's looking at it. LandingPage stays eager since it's the one route
// almost everyone hits first.
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const FacilitatorPage = lazy(() => import('./pages/FacilitatorPage').then((m) => ({ default: m.FacilitatorPage })))
const PlayerPage = lazy(() => import('./pages/PlayerPage').then((m) => ({ default: m.PlayerPage })))
const CoachPage = lazy(() => import('./pages/CoachPage').then((m) => ({ default: m.CoachPage })))
const OrganizerPage = lazy(() => import('./pages/OrganizerPage').then((m) => ({ default: m.OrganizerPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))

const queryClient = new QueryClient()

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ChatUIProvider>
            <GlobalChatListener />
            <PushNotificationsBootstrap />
            <BrowserRouter>
              <FloatingChatWindows />
              <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route
                  path="/login"
                  element={
                    <GuestRoute>
                      <LoginPage />
                    </GuestRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <GuestRoute>
                      <RegisterPage />
                    </GuestRoute>
                  }
                />
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
                    <ProtectedRoute roles={['organizer', 'venue_organizer', 'livestream_organizer']}>
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
              </Suspense>
            </BrowserRouter>
          </ChatUIProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
