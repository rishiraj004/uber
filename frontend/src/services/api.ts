import axios from "axios";

const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
    baseURL: `${BACKEND_URL}/api/v1`,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;