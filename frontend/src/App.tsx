import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import SignupPage from './pages/signup'
import LoginPage from './pages/login'
import HomePage from './pages/home'
import CaptainDashboard from './pages/captain-dashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/captain/dashboard" element={<CaptainDashboard />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
