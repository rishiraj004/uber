import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import SignupPage from './pages/signup'
import LoginPage from './pages/login'
import HomePage from './pages/home'
import CaptainDashboard from './pages/captain-dashboard'
import RiderTracking from './pages/RiderTracking'
import CaptainTracking from './pages/CaptainTracking'
import { SocketProvider } from './context/SocketProvider'

function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/captain/dashboard" element={<CaptainDashboard />} />
          <Route path="/rider-tracking" element={<RiderTracking />} />
          <Route path="/captain-tracking" element={<CaptainTracking />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </SocketProvider>
    </BrowserRouter>
  )
}

export default App
