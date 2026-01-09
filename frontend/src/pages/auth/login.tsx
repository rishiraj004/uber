// filepath: c:\Users\rishi\Web-Dev-Projects\uber\frontend\src\pages\login.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import api from "../../services/api";

type Role = "RIDER" | "CAPTAIN";

type ApiErrorResponse = {
  message?: string;
};

const emailLooksValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const getApiErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorResponse;
    return data?.message || err.message || "Login failed";
  }
  return "Login failed";
};

const LoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    if (!emailLooksValid(email)) return false;
    if (!password || password.length < 6) return false;
    return true;
  }, [email, password]);

  useEffect(() => {
    document.title = "Login • Uber";

    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role") as Role | null;

    if (token && role) {
      if (role === "CAPTAIN") navigate("/captain/dashboard", { replace: true });
      else navigate("/home", { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!canSubmit) {
      setError("Please fix the form errors before continuing.");
      return;
    }

    try {
      setSubmitting(true);

      const response = await api.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });

      const token: string | undefined = response.data?.token;
      const userRole: Role | undefined = response.data?.user?.role;

      if (!token || !userRole) {
        setError("Unexpected response from server. Please try again.");
        return;
      }

      localStorage.setItem("token", token);
      localStorage.setItem("role", userRole);

      if (userRole === "CAPTAIN") navigate("/captain-dashboard", { replace: true });
      else navigate("/rider-dashboard", { replace: true });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Uber</h1>
          <p className="text-sm text-zinc-400 mt-1">Welcome back. Log in to continue.</p>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-1">Email</label>
            <input
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              className="w-full rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-500"
              type="email"
              placeholder="email@example.com"
              autoComplete="email"
            />
            {!emailLooksValid(email) && email.length > 0 ? (
              <p className="mt-1 text-xs text-red-300">Enter a valid email address.</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-1">Password</label>
            <div className="relative">
              <input
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="w-full rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 pr-12 outline-none focus:border-zinc-500"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-zinc-300 hover:text-zinc-100"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {password.length > 0 && password.length < 6 ? (
              <p className="mt-1 text-xs text-red-300">Password must be at least 6 characters.</p>
            ) : null}
          </div>

          <button
            disabled={!canSubmit || submitting}
            className={[
              "w-full rounded-lg px-4 py-2 text-sm font-semibold transition",
              !canSubmit || submitting
                ? "bg-zinc-700 text-zinc-300 cursor-not-allowed"
                : "bg-white text-zinc-950 hover:bg-zinc-200",
            ].join(" ")}
          >
            {submitting ? "Logging in..." : "Log in"}
          </button>

          <p className="text-center text-sm text-zinc-400">
            Don&apos;t have an account?{" "}
            <Link to="/signup" className="text-zinc-100 hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;