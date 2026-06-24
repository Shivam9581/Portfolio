/**
 * Optimal Debt Settlement (exact, exponential time)
 * ----------------------------------------------------
 * The greedy algorithm in settleDebts.ts is fast (O(n log n)) but not
 * always minimal in transaction COUNT. Example where greedy is suboptimal:
 *
 *   A: +10, B: +10, C: -10, D: -10
 *
 * Greedy pairs largest-vs-largest: A and B are tied creditors, C and D
 * tied debtors. Either pairing works here and greedy happens to find the
 * 2-transaction optimum. But with amounts like:
 *
 *   A: +30, B: +20, C: -10, D: -10, E: -30
 *
 * greedy may produce 4 transactions where a smarter pairing finds 3
 * (e.g., E pays A 30 directly; B is settled by C+D). The exact algorithm
 * below searches all ways to partition non-zero balances into zero-sum
 * subsets and picks the partition that minimizes total transactions
 * (a subset of size k needs k-1 transactions to settle internally).
 *
 * This is exponential (essentially trying all subsets), so it's only
 * safe to run on small groups. We gate it behind MAX_OPTIMAL_GROUP_SIZE
 * and fall back to the greedy algorithm above that threshold.
 */

import { Balance, Transaction, simplifyDebts } from "./settleDebts";

export const MAX_OPTIMAL_GROUP_SIZE = 12; // 2^12 = 4096 subsets, fast enough

export function settleDebtsOptimal(balances: Balance[]): Transaction[] {
  const nonZero = balances.filter((b) => b.amountCents !== 0);

  if (nonZero.length === 0) return [];

  if (nonZero.length > MAX_OPTIMAL_GROUP_SIZE) {
    // Exact search is too expensive at this size; greedy is a safe,
    // well-tested fallback that's at most a small constant factor off.
    return simplifyDebts(balances);
  }

  const n = nonZero.length;
  const amounts = nonZero.map((b) => b.amountCents);

  // memo: bitmask of "settled" people -> min transactions to settle the rest
  const memo = new Map<number, number>();
  const choice = new Map<number, number>(); // mask -> the subset mask it used first

  const fullMask = (1 << n) - 1;

  function solve(mask: number): number {
    if (mask === 0) return 0;
    if (memo.has(mask)) return memo.get(mask)!;

    // Find lowest unset-in-"settled" person to fix as anchor (standard
    // trick to avoid re-counting the same subset in different orders)
    let first = -1;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        first = i;
        break;
      }
    }

    let best = Infinity;
    let bestSub = -1;

    // Try every subset of `mask` that includes `first` and sums to zero
    for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
      if (!(sub & (1 << first))) continue;

      let sum = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (sub & (1 << i)) {
          sum += amounts[i];
          count++;
        }
      }

      if (sum === 0 && count > 0) {
        const remaining = mask & ~sub;
        const cost = (count - 1) + solve(remaining);
        if (cost < best) {
          best = cost;
          bestSub = sub;
        }
      }
    }

    memo.set(mask, best);
    choice.set(mask, bestSub);
    return best;
  }

  solve(fullMask);

  // Reconstruct transactions from the chosen subsets
  const transactions: Transaction[] = [];
  let mask = fullMask;

  while (mask !== 0) {
    const sub = choice.get(mask);
    if (sub === undefined || sub === -1) break; // no valid zero-sum subset found (shouldn't happen if input is balanced)

    const subBalances: Balance[] = [];
    for (let i = 0; i < n; i++) {
      if (sub & (1 << i)) {
        subBalances.push({ userId: nonZero[i].userId, amountCents: amounts[i] });
      }
    }

    // Settle this zero-sum subset with the simple greedy pass — within
    // a subset that sums to zero, greedy IS optimal (count - 1 transactions).
    transactions.push(...simplifyDebts(subBalances));

    mask &= ~sub;
  }

  return transactions;
}
