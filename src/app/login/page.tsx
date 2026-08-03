"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Lock, LogIn, Mail } from "lucide-react";
import { useAuth } from "@/src/components/auth/AuthProvider";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await login(email.trim(), password);
    setBusy(false);
    if (res.ok) {
      router.push("/dashboard");
    } else {
      setError(res.error || "Login failed.");
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm glass-card-premium rounded-2xl p-8">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-lg shadow-[rgba(6,182,212,0.35)] mb-4">
            <BarChart3 size={26} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-black tracking-tight text-[var(--foreground)]">FleetCore</h1>
          <p className="text-xs text-[var(--nav-text-color)] mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="username"
                className="w-full pl-9 pr-3 h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-sm text-[var(--foreground)] placeholder:text-[var(--nav-text-color)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nav-text-color)]" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full pl-9 pr-3 h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] text-sm text-[var(--foreground)] placeholder:text-[var(--nav-text-color)] focus:outline-none focus:ring-2 focus:ring-[#06B6D4] focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white text-sm font-bold shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <LogIn size={16} strokeWidth={2.5} />
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
