import { useState, FormEvent } from "react";
import { api } from "../lib/api";
import { Member } from "../types";

interface Props {
  groupId: string;
  members: Member[];
  onCreated: () => void;
}

export default function AddExpenseForm({ groupId, members, onCreated }: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidByUserId, setPaidByUserId] = useState(members[0]?.id ?? "");
  const [participantIds, setParticipantIds] = useState<Set<string>>(
    new Set(members.map((m) => m.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleParticipant(id: string) {
    setParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const totalCents = Math.round(parseFloat(amount) * 100);
    if (!totalCents || totalCents <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (participantIds.size === 0) {
      setError("Select at least one participant");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/expenses", {
        groupId,
        description,
        totalCents,
        paidByUserId,
        splitType: "equal",
        participantUserIds: Array.from(participantIds),
      });
      setDescription("");
      setAmount("");
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-ink/10 rounded-lg p-5 space-y-4">
      <h3 className="font-medium text-ink/80">Add an expense</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-sm text-ink/60 mb-1">What was it for?</label>
          <input
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Groceries, gas, dinner…"
            className="w-full rounded-md border border-ink/15 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500"
          />
        </div>
        <div>
          <label className="block text-sm text-ink/60 mb-1">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-ink/40">$</span>
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-ink/15 pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500 font-mono"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-ink/60 mb-1">Paid by</label>
          <select
            value={paidByUserId}
            onChange={(e) => setPaidByUserId(e.target.value)}
            className="w-full rounded-md border border-ink/15 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-moss-500"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-ink/60 mb-2">Split equally between</label>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => toggleParticipant(m.id)}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                participantIds.has(m.id)
                  ? "bg-moss-100 border-moss-300 text-moss-700"
                  : "border-ink/15 text-ink/40"
              }`}
            >
              {m.display_name}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-rust-500 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-moss-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-moss-700 disabled:opacity-60"
      >
        {submitting ? "Adding…" : "Add expense"}
      </button>
    </form>
  );
}
