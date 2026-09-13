import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useEffect } from 'react'
import { api } from './services/api'
import { LoginPage, RegisterPage, UploadCVPage, DashboardPage } from './pages'
import { CVManagementPage } from './pages/CVManagementPage'
import { PostulationsPage } from './pages/PostulationsPage'
import { OffersPage } from './pages/OffersPage'
import { InsightsPage } from './pages/InsightsPage'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  const token = useAuthStore(s => s.token)
  const loadFromStorage = useAuthStore(s => s.loadFromStorage)

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  useEffect(() => {
    if (token) {
      api.setToken(token)
    }
  }, [token])

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cv-upload"
          element={
            <ProtectedRoute>
              <UploadCVPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cv-management"
          element={
            <ProtectedRoute>
              <CVManagementPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/postulations"
          element={
            <ProtectedRoute>
              <PostulationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/offers"
          element={
            <ProtectedRoute>
              <OffersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/insights"
          element={
            <ProtectedRoute>
              <InsightsPage />
            </ProtectedRoute>
          }
        />

        {/* Redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
