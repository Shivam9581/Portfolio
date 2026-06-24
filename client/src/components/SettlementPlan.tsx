import { useState } from "react";
import { api, formatCents } from "../lib/api";
import { Balance, Member, SettlementTransaction } from "../types";

interface Props {
  groupId: string;
  balances: Balance[];
  plan: SettlementTransaction[];
  membersById: Map<string, Member>;
  currentUserId: string;
  onSettled: () => void;
}

export default function SettlementPlan({
  groupId,
  balances,
  plan,
  membersById,
  currentUserId,
  onSettled,
}: Props) {
  const [settling, setSettling] = useState<string | null>(null);

  function nameOf(userId: string): string {
    return membersById.get(userId)?.display_name ?? "Someone";
  }

  async function markSettled(t: SettlementTransaction, idx: number) {
    setSettling(`${idx}`);
    try {
      await api.post("/balances/settlements", {
        groupId,
        fromUserId: t.fromUserId,
        toUserId: t.toUserId,
        amountCents: t.amountCents,
      });
      onSettled();
    } finally {
      setSettling(null);
    }
  }

  if (balances.length === 0) {
    return (
      <div className="bg-moss-50 border border-moss-100 rounded-lg p-6 text-center">
        <p className="text-moss-700 font-medium">Everyone's settled up 🌿</p>
        <p className="text-sm text-ink/50 mt-1">No outstanding balances in this group.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium text-ink/80 mb-3">Current balances</h3>
        <div className="space-y-1.5">
          {balances.map((b) => (
            <div key={b.userId} className="flex items-center justify-between text-sm">
              <span className={b.userId === currentUserId ? "font-medium" : "text-ink/70"}>
                {nameOf(b.userId)} {b.userId === currentUserId && "(you)"}
              </span>
              <span className={`font-mono ${b.amountCents > 0 ? "text-moss-600" : "text-rust-500"}`}>
                {b.amountCents > 0 ? "+" : ""}
                {formatCents(b.amountCents)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="ledger-rule" />

      <div>
        <h3 className="font-medium text-ink/80 mb-1">Suggested settlements</h3>
        <p className="text-xs text-ink/40 mb-3">
          The fewest payments needed to settle everyone up — {plan.length} transaction
          {plan.length !== 1 ? "s" : ""} instead of every individual debt.
        </p>
        <div className="space-y-2">
          {plan.map((t, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-white border border-ink/10 rounded-lg px-4 py-3"
            >
              <div className="text-sm">
                <span className="font-medium">{nameOf(t.fromUserId)}</span>
                <span className="text-ink/40"> pays </span>
                <span className="font-medium">{nameOf(t.toUserId)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">{formatCents(t.amountCents)}</span>
                <button
                  onClick={() => markSettled(t, idx)}
                  disabled={settling === `${idx}`}
                  className="text-xs bg-moss-600 text-white px-3 py-1.5 rounded-md hover:bg-moss-700 disabled:opacity-60"
                >
                  {settling === `${idx}` ? "…" : "Mark paid"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
