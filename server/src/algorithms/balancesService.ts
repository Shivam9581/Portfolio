import { pool } from "../db/pool.js";
import {
  computeNetBalances,
  simplifyDebts,
  ExpenseSplit,
  Balance,
} from "../algorithms/settleDebts.js";
import { settleDebtsOptimal, MAX_OPTIMAL_GROUP_SIZE } from "../algorithms/settleDebtsOptimal.js";

/**
 * Loads all active (non-deleted) expenses for a group, converts them into
 * the ExpenseSplit shape the algorithm expects, and folds in any already-
 * recorded settlements so we only show what's still owed.
 */
export async function getGroupBalances(groupId: string): Promise<Balance[]> {
  const expensesResult = await pool.query<{
    id: string;
    paid_by_user_id: string;
    total_cents: string; // pg returns BIGINT as string to avoid precision loss
  }>(
    `SELECT id, paid_by_user_id, total_cents
     FROM expenses
     WHERE group_id = $1 AND deleted_at IS NULL`,
    [groupId]
  );

  const expenseIds = expensesResult.rows.map((r) => r.id);

  const sharesResult = expenseIds.length
    ? await pool.query<{ expense_id: string; user_id: string; share_cents: string }>(
        `SELECT expense_id, user_id, share_cents
         FROM expense_shares
         WHERE expense_id = ANY($1::uuid[])`,
        [expenseIds]
      )
    : { rows: [] };

  const sharesByExpense = new Map<string, { userId: string; shareCents: number }[]>();
  for (const row of sharesResult.rows) {
    const list = sharesByExpense.get(row.expense_id) ?? [];
    list.push({ userId: row.user_id, shareCents: Number(row.share_cents) });
    sharesByExpense.set(row.expense_id, list);
  }

  const expenseSplits: ExpenseSplit[] = expensesResult.rows.map((row) => ({
    expenseId: row.id,
    paidByUserId: row.paid_by_user_id,
    totalAmountCents: Number(row.total_cents),
    shares: sharesByExpense.get(row.id) ?? [],
  }));

  const rawBalances = computeNetBalances(expenseSplits);

  // Fold in settlements already recorded — each one effectively moves
  // money from the payer's net (more negative -> less negative) to the
  // receiver's net (less positive -> more, wait — actually a settlement
  // payment REDUCES what's owed, so it works like a transaction already
  // applied).
  const settlementsResult = await pool.query<{
    from_user_id: string;
    to_user_id: string;
    amount_cents: string;
  }>(`SELECT from_user_id, to_user_id, amount_cents FROM settlements WHERE group_id = $1`, [
    groupId,
  ]);

  const net = new Map(rawBalances.map((b) => [b.userId, b.amountCents]));
  for (const s of settlementsResult.rows) {
    const amount = Number(s.amount_cents);
    net.set(s.from_user_id, (net.get(s.from_user_id) ?? 0) + amount);
    net.set(s.to_user_id, (net.get(s.to_user_id) ?? 0) - amount);
  }

  return Array.from(net.entries())
    .filter(([, amount]) => amount !== 0)
    .map(([userId, amountCents]) => ({ userId, amountCents }));
}

/**
 * Returns the recommended minimal settlement plan for a group.
 * Uses the exact algorithm for small groups, falls back to greedy
 * for larger ones (see settleDebtsOptimal.ts for the tradeoff).
 */
export async function getSettlementPlan(groupId: string) {
  const balances = await getGroupBalances(groupId);

  const plan =
    balances.length <= MAX_OPTIMAL_GROUP_SIZE
      ? settleDebtsOptimal(balances)
      : simplifyDebts(balances);

  return { balances, plan };
}
