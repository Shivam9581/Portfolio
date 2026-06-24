/**
 * Debt Simplification Engine
 * ---------------------------
 * Problem: a group of people owe each other money across many individual
 * expenses. Naively, settling up means everyone pays back every debt they
 * personally created — which can mean dozens of small transactions even
 * though most of them cancel out.
 *
 * Goal: given the NET balance of every person (positive = is owed money,
 * negative = owes money), compute the *minimum* set of transactions that
 * settles everyone to zero.
 *
 * Approach:
 *  1. Reduce all individual expenses to a single net balance per person.
 *     (This step is what makes the rest of the algorithm fast — we never
 *     look at the raw expense graph again, only net positions.)
 *  2. Split people into creditors (net > 0) and debtors (net < 0).
 *  3. Greedily match the largest debtor against the largest creditor,
 *     settle as much as possible between them, repeat.
 *
 * This greedy approach is NOT guaranteed to produce the theoretical
 * minimum number of transactions (that's an NP-hard problem related to
 * subset-sum partitioning — see notes at the bottom of this file). But it
 * produces a *very good* approximation in O(n log n) and is simple enough
 * to reason about, test, and explain in an interview. That tradeoff is
 * itself worth being able to talk about.
 */

export interface Balance {
  userId: string;
  /** Positive = this person should RECEIVE money. Negative = they OWE money. */
  amountCents: number;
}

export interface Transaction {
  fromUserId: string; // pays
  toUserId: string; // receives
  amountCents: number;
}

const EPSILON_CENTS = 0; // we work in integer cents, so no float epsilon needed

/**
 * Reduces a list of raw balances into the minimal-ish set of settling
 * transactions. Always works in integer cents to avoid floating point
 * drift — see README section "Why integer cents".
 */
export function simplifyDebts(balances: Balance[]): Transaction[] {
  // Defensive copy + drop anyone already settled
  const working = balances
    .filter((b) => b.amountCents !== EPSILON_CENTS)
    .map((b) => ({ ...b }));

  assertBalanced(working);

  const creditors = working
    .filter((b) => b.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents); // largest first

  const debtors = working
    .filter((b) => b.amountCents < 0)
    .sort((a, b) => a.amountCents - b.amountCents); // most negative first

  const transactions: Transaction[] = [];

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];

    const owed = -debtor.amountCents; // positive magnitude of debt
    const settleAmount = Math.min(creditor.amountCents, owed);

    if (settleAmount > 0) {
      transactions.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amountCents: settleAmount,
      });
    }

    creditor.amountCents -= settleAmount;
    debtor.amountCents += settleAmount;

    if (creditor.amountCents === 0) ci++;
    if (debtor.amountCents === 0) di++;
  }

  return transactions;
}

/**
 * Sanity check: net balances across a closed group must always sum to
 * zero. If they don't, something upstream (expense creation, split
 * calculation) has a bug — better to throw loudly here than silently
 * produce a wrong settlement plan.
 */
function assertBalanced(balances: Balance[]): void {
  const sum = balances.reduce((acc, b) => acc + b.amountCents, 0);
  if (sum !== 0) {
    throw new Error(
      `Balances do not sum to zero (off by ${sum} cents). ` +
        `This indicates a bug in expense/split calculation upstream.`
    );
  }
}

/**
 * Converts a raw list of expenses + splits into net balances per user.
 * This is the bridge between "what people actually entered" and the
 * settlement algorithm above.
 */
export interface ExpenseSplit {
  expenseId: string;
  paidByUserId: string;
  totalAmountCents: number;
  /** Each participant's share of this specific expense. Must sum to totalAmountCents. */
  shares: { userId: string; shareCents: number }[];
}

export function computeNetBalances(expenses: ExpenseSplit[]): Balance[] {
  const net = new Map<string, number>();

  const add = (userId: string, delta: number) => {
    net.set(userId, (net.get(userId) ?? 0) + delta);
  };

  for (const expense of expenses) {
    const shareSum = expense.shares.reduce((a, s) => a + s.shareCents, 0);
    if (shareSum !== expense.totalAmountCents) {
      throw new Error(
        `Expense ${expense.expenseId}: shares sum to ${shareSum} cents but ` +
          `total is ${expense.totalAmountCents} cents. Rounding bug in split calculation.`
      );
    }

    // The payer is owed back everything except their own share.
    add(expense.paidByUserId, expense.totalAmountCents);
    for (const share of expense.shares) {
      add(share.userId, -share.shareCents);
    }
  }

  return Array.from(net.entries()).map(([userId, amountCents]) => ({
    userId,
    amountCents,
  }));
}

/*
 * NOTE ON OPTIMALITY (worth mentioning in an interview):
 *
 * Finding the absolute minimum number of transactions to zero out a set
 * of balances is equivalent to a variant of the "minimum transactions to
 * settle accounts" problem, which is NP-hard in general (it reduces to
 * subset-sum / partition problems when balances can be grouped into
 * zero-sum subsets). For small groups (the realistic case — most expense
 * groups have under ~15 people) an exact solution via DFS + bitmasking
 * is feasible, and is a natural "v2" to mention as a follow-up:
 * see settleDebtsOptimal.ts for that exact version, gated behind a size
 * threshold so it never runs on large groups.
 */
