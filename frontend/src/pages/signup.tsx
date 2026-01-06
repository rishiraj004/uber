import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import api from "../services/api";

type Role = "RIDER" | "CAPTAIN";

type ApiErrorResponse = {
  message?: string;
};

const emailLooksValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const getApiErrorMessage = (err: unknown): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorResponse;
    return data?.message || err.message || "Signup failed";
  }
  return "Signup failed";
};

const SignupPage: React.FC = () => {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("RIDER");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    if (!fullName.trim()) return false;
    if (!emailLooksValid(email)) return false;
    if (password.length < 6) return false;
    if (password !== confirmPassword) return false;
    return true;
  }, [fullName, email, password, confirmPassword]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!canSubmit) {
      setError("Please fix the form errors before continuing.");
      return;
    }

    try {
      setSubmitting(true);

      const response = await api.post("/auth/signup", {
        email: email.trim().toLowerCase(),
        password,
        fullName: fullName.trim(),
        role,
      });

      const token: string | undefined = response.data?.token;
      const userRole: Role | undefined = response.data?.user?.role;

      if (!token || !userRole) {
        setError("Unexpected response from server. Please try again.");
        return;
      }

      localStorage.setItem("token", token);
      localStorage.setItem("role", userRole);

      if (userRole === "CAPTAIN") navigate("/captain/dashboard", { replace: true });
      else navigate("/home", { replace: true });
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
          <p className="text-sm text-zinc-400 mt-1">Create your account to get started.</p>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-1">Full name</label>
            <input
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setError("");
              }}
              className="w-full rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-500"
              placeholder="Rishi Raj"
              autoComplete="name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-1">Email</label>
            <input
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              className="w-full rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-500"
              placeholder="email@example.com"
              type="email"
              autoComplete="email"
              required
            />
            {!emailLooksValid(email) && email.length > 0 ? (
              <p className="mt-1 text-xs text-red-300">Enter a valid email address.</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-2">Account type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("RIDER")}
                className={[
                  "rounded-lg border px-3 py-2 text-sm font-semibold",
                  role === "RIDER"
                    ? "border-zinc-200 bg-zinc-200 text-zinc-950"
                    : "border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:border-zinc-600",
                ].join(" ")}
              >
                Rider
              </button>
              <button
                type="button"
                onClick={() => setRole("CAPTAIN")}
                className={[
                  "rounded-lg border px-3 py-2 text-sm font-semibold",
                  role === "CAPTAIN"
                    ? "border-zinc-200 bg-zinc-200 text-zinc-950"
                    : "border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:border-zinc-600",
                ].join(" ")}
              >
                Captain
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-1">Password</label>
            <div className="flex gap-2">
              <input
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="flex-1 rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-500"
                placeholder="Minimum 6 characters"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-600"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {password.length > 0 && password.length < 6 ? (
              <p className="mt-1 text-xs text-red-300">Password must be at least 6 characters.</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-200 mb-1">Confirm password</label>
            <input
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError("");
              }}
              className="w-full rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2 outline-none focus:border-zinc-500"
              placeholder="Re-enter password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={6}
            />
            {confirmPassword.length > 0 && confirmPassword !== password ? (
              <p className="mt-1 text-xs text-red-300">Passwords do not match.</p>
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
            {submitting ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <Link to="/login" className="text-zinc-100 underline underline-offset-4">
              Log in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignupPage;