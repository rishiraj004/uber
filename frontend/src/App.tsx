import './App.css'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SignupPage, LoginPage, RiderDashboard, RiderTracking, CaptainDashboard, CaptainTracking, Receipt, RideHistory, Profile, CaptainDocuments, AdminDashboard } from './pages'
import { SocketProvider } from './context/SocketProvider'
import ProtectedRoute from './components/ProtectedRoute'
import SharedRideTracking from './pages/SharedRideTracking'

function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <Toaster position="top-center" reverseOrder={false} />
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/rider-dashboard" element={<ProtectedRoute allow="RIDER"><RiderDashboard /></ProtectedRoute>} />
          <Route path="/captain-dashboard" element={<ProtectedRoute allow="CAPTAIN"><CaptainDashboard /></ProtectedRoute>} />
          <Route path="/captain/documents" element={<ProtectedRoute allow="CAPTAIN"><CaptainDocuments /></ProtectedRoute>} />
          <Route path="/rider-tracking" element={<ProtectedRoute allow="RIDER"><RiderTracking /></ProtectedRoute>} />
          <Route path="/rider-receipt" element={<ProtectedRoute allow="RIDER"><Receipt /></ProtectedRoute>} />
          <Route path="/captain-tracking" element={<ProtectedRoute allow="CAPTAIN"><CaptainTracking /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute allow="ADMIN"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/ride-history" element={<ProtectedRoute allow="BOTH"><RideHistory /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute allow="BOTH"><Profile /></ProtectedRoute>} />
          {/* Public route for shared ride tracking */}
          <Route path="/track/:token" element={<SharedRideTracking />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </SocketProvider>
    </BrowserRouter>
  )
}

export default App
