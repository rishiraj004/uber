import './App.css'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SignupPage, LoginPage, RiderDashboard, RiderTracking, CaptainDashboard, CaptainTracking, Receipt } from './pages'
import { SocketProvider } from './context/SocketProvider'
import ProtectedRoute from './components/ProtectedRoute'

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
          <Route path="/rider-tracking" element={<ProtectedRoute allow="RIDER"><RiderTracking /></ProtectedRoute>} />
          <Route path="/rider-receipt" element={<ProtectedRoute allow="RIDER"><Receipt /></ProtectedRoute>} />
          <Route path="/captain-tracking" element={<ProtectedRoute allow="CAPTAIN"><CaptainTracking /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </SocketProvider>
    </BrowserRouter>
  )
}

export default App
