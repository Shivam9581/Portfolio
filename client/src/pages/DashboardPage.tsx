import { useEffect, useState, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { Group } from "../types";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [memberEmails, setMemberEmails] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get("/groups").then((res) => setGroups(res.data.groups));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const emails = memberEmails
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      const res = await api.post("/groups", { name, memberEmails: emails });
      navigate(`/groups/${res.data.groupId}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen max-w-2xl mx-auto px-4 py-10">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl font-semibold text-moss-700">Split</h1>
          <p className="text-ink/50 text-sm">Hey {user?.displayName}</p>
        </div>
        <button onClick={logout} className="text-sm text-ink/50 hover:text-ink">
          Sign out
        </button>
      </header>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-medium text-ink/80">Your groups</h2>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="text-sm bg-moss-600 text-white px-4 py-2 rounded-md hover:bg-moss-700 transition-colors"
        >
          + New group
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white border border-ink/10 rounded-lg p-5 mb-6 space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">Group name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cabin trip, Roommates, …"
              className="w-full rounded-md border border-ink/15 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Invite by email (comma-separated, optional)
            </label>
            <input
              value={memberEmails}
              onChange={(e) => setMemberEmails(e.target.value)}
              placeholder="ana@example.com, ben@example.com"
              className="w-full rounded-md border border-ink/15 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="bg-moss-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-moss-700 disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create group"}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {groups.length === 0 && !showCreate && (
          <p className="text-ink/40 text-sm py-8 text-center">
            No groups yet. Create one to start tracking shared expenses.
          </p>
        )}
        {groups.map((g) => (
          <Link
            key={g.id}
            to={`/groups/${g.id}`}
            className="block bg-white border border-ink/10 rounded-lg px-5 py-4 hover:border-moss-300 transition-colors"
          >
            <p className="font-medium">{g.name}</p>
            <p className="text-xs text-ink/40">{g.currency}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
