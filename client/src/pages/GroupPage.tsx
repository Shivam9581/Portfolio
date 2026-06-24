import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, formatCents } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useGroupSocket } from "../hooks/useGroupSocket";
import { Balance, Expense, Group, Member, SettlementTransaction } from "../types";
import AddExpenseForm from "../components/AddExpenseForm";
import SettlementPlan from "../components/SettlementPlan";

export default function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [plan, setPlan] = useState<SettlementTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const membersById = new Map(members.map((m) => [m.id, m]));

  const refresh = useCallback(async () => {
    if (!groupId) return;
    const [groupRes, expensesRes, planRes] = await Promise.all([
      api.get(`/groups/${groupId}`),
      api.get(`/expenses/group/${groupId}`),
      api.get(`/balances/group/${groupId}/settlement-plan`),
    ]);
    setGroup(groupRes.data.group);
    setMembers(groupRes.data.members);
    setExpenses(expensesRes.data.expenses);
    setBalances(planRes.data.balances);
    setPlan(planRes.data.plan);
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: any group member adding an expense or recording a
  // settlement triggers everyone's view to refresh automatically.
  useGroupSocket(groupId, refresh);

  if (loading || !group) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-ink/40">Loading…</div>;
  }

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="text-sm text-ink/40 hover:text-ink/70">
        ← All groups
      </Link>
      <h1 className="font-display text-3xl font-semibold text-moss-700 mt-2 mb-1">{group.name}</h1>
      <p className="text-sm text-ink/40 mb-8">
        {members.map((m) => m.display_name).join(", ")}
      </p>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <AddExpenseForm groupId={group.id} members={members} onCreated={refresh} />

          <div>
            <h3 className="font-medium text-ink/80 mb-3">Recent expenses</h3>
            <div className="space-y-1.5">
              {expenses.length === 0 && (
                <p className="text-sm text-ink/40">No expenses yet — add one above.</p>
              )}
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between bg-white border border-ink/10 rounded-md px-4 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-medium">{e.description}</p>
                    <p className="text-xs text-ink/40">paid by {e.paid_by_name}</p>
                  </div>
                  <span className="font-mono">{formatCents(Number(e.total_cents), group.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <SettlementPlan
            groupId={group.id}
            balances={balances}
            plan={plan}
            membersById={membersById}
            currentUserId={user!.id}
            onSettled={refresh}
          />
        </div>
      </div>
    </div>
  );
}
