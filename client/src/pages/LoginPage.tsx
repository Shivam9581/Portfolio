import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl font-semibold text-moss-700 mb-1">Split</h1>
        <p className="text-ink/60 mb-8">Welcome back. Settle up below.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500"
            />
          </div>

          {error && <p className="text-rust-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-moss-600 text-white font-medium py-2.5 hover:bg-moss-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-sm text-ink/60 mt-6">
          New here?{" "}
          <Link to="/signup" className="text-moss-600 font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
