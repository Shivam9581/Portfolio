import { useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(email, password, displayName);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.error?.fieldErrors?.password?.[0] ?? err.response?.data?.error ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl font-semibold text-moss-700 mb-1">Split</h1>
        <p className="text-ink/60 mb-8">Create an account to start a group.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">Name</label>
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500"
            />
          </div>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500"
            />
            <p className="text-xs text-ink/40 mt-1">At least 8 characters</p>
          </div>

          {error && <p className="text-rust-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-moss-600 text-white font-medium py-2.5 hover:bg-moss-700 transition-colors disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-ink/60 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-moss-600 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
