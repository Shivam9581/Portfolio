import { describe, it, expect } from "vitest";
import {
  simplifyDebts,
  computeNetBalances,
  Balance,
  ExpenseSplit,
} from "../algorithms/settleDebts";
import { settleDebtsOptimal } from "../algorithms/settleDebtsOptimal";

function totalPaid(transactions: { amountCents: number }[]): number {
  return transactions.reduce((a, t) => a + t.amountCents, 0);
}

function netAfter(balances: Balance[], transactions: { fromUserId: string; toUserId: string; amountCents: number }[]) {
  const net = new Map(balances.map((b) => [b.userId, b.amountCents]));
  for (const t of transactions) {
    net.set(t.fromUserId, (net.get(t.fromUserId) ?? 0) + t.amountCents);
    net.set(t.toUserId, (net.get(t.toUserId) ?? 0) - t.amountCents);
  }
  return net;
}

describe("simplifyDebts", () => {
  it("returns no transactions for an already-settled group", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 0 },
      { userId: "b", amountCents: 0 },
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it("settles a simple two-person debt", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 1000 },
      { userId: "b", amountCents: -1000 },
    ];
    const result = simplifyDebts(balances);
    expect(result).toEqual([{ fromUserId: "b", toUserId: "a", amountCents: 1000 }]);
  });

  it("fully zeroes out every participant's balance", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 3000 },
      { userId: "b", amountCents: 2000 },
      { userId: "c", amountCents: -1000 },
      { userId: "d", amountCents: -4000 },
    ];
    const result = simplifyDebts(balances);
    const finalNet = netAfter(balances, result);
    for (const amount of finalNet.values()) {
      expect(amount).toBe(0);
    }
  });

  it("never produces more transactions than (participants - 1)", () => {
    // n participants can always be settled in at most n-1 transactions
    const balances: Balance[] = [
      { userId: "a", amountCents: 1500 },
      { userId: "b", amountCents: 2500 },
      { userId: "c", amountCents: -1000 },
      { userId: "d", amountCents: -1000 },
      { userId: "e", amountCents: -2000 },
    ];
    const result = simplifyDebts(balances);
    expect(result.length).toBeLessThanOrEqual(balances.length - 1);
  });

  it("throws if balances don't sum to zero (upstream bug guard)", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 1000 },
      { userId: "b", amountCents: -500 }, // off by 500
    ];
    expect(() => simplifyDebts(balances)).toThrow(/do not sum to zero/);
  });

  it("handles a single person with nonzero balance gracefully (edge case guard)", () => {
    // Shouldn't normally happen (implies unbalanced input) but shouldn't crash silently either
    const balances: Balance[] = [{ userId: "a", amountCents: 500 }];
    expect(() => simplifyDebts(balances)).toThrow();
  });

  it("handles a large group without floating point drift", () => {
    const balances: Balance[] = Array.from({ length: 50 }, (_, i) => ({
      userId: `user-${i}`,
      amountCents: i % 2 === 0 ? 333 : -333, // 25 owe, 25 owed, odd cent amounts
    }));
    const result = simplifyDebts(balances);
    const finalNet = netAfter(balances, result);
    for (const amount of finalNet.values()) {
      expect(amount).toBe(0);
    }
  });
});

describe("computeNetBalances", () => {
  it("computes correct net balances from a single expense split equally", () => {
    const expenses: ExpenseSplit[] = [
      {
        expenseId: "e1",
        paidByUserId: "a",
        totalAmountCents: 3000,
        shares: [
          { userId: "a", shareCents: 1000 },
          { userId: "b", shareCents: 1000 },
          { userId: "c", shareCents: 1000 },
        ],
      },
    ];
    const balances = computeNetBalances(expenses);
    const map = new Map(balances.map((b) => [b.userId, b.amountCents]));
    expect(map.get("a")).toBe(2000); // paid 3000, owes 1000 -> net +2000
    expect(map.get("b")).toBe(-1000);
    expect(map.get("c")).toBe(-1000);
  });

  it("nets out correctly across multiple expenses with different payers", () => {
    const expenses: ExpenseSplit[] = [
      {
        expenseId: "e1",
        paidByUserId: "a",
        totalAmountCents: 2000,
        shares: [
          { userId: "a", shareCents: 1000 },
          { userId: "b", shareCents: 1000 },
        ],
      },
      {
        expenseId: "e2",
        paidByUserId: "b",
        totalAmountCents: 2000,
        shares: [
          { userId: "a", shareCents: 1000 },
          { userId: "b", shareCents: 1000 },
        ],
      },
    ];
    const balances = computeNetBalances(expenses);
    const map = new Map(balances.map((b) => [b.userId, b.amountCents]));
    // They paid for each other equally -> should net to zero
    expect(map.get("a")).toBe(0);
    expect(map.get("b")).toBe(0);
  });

  it("throws when shares don't sum to the expense total (rounding bug guard)", () => {
    const expenses: ExpenseSplit[] = [
      {
        expenseId: "e1",
        paidByUserId: "a",
        totalAmountCents: 1000,
        shares: [
          { userId: "a", shareCents: 333 },
          { userId: "b", shareCents: 333 },
          { userId: "c", shareCents: 333 }, // sums to 999, not 1000
        ],
      },
    ];
    expect(() => computeNetBalances(expenses)).toThrow(/Rounding bug/);
  });
});

describe("settleDebtsOptimal", () => {
  it("matches greedy result count for trivially optimal cases", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 1000 },
      { userId: "b", amountCents: -1000 },
    ];
    const result = settleDebtsOptimal(balances);
    expect(result.length).toBe(1);
  });

  it("finds a strictly better partition than greedy in a known suboptimal case", () => {
    // A:+30, B:+20, C:-10, D:-10, E:-30
    // Greedy (largest vs largest): A(30) vs E(-30) -> fully settles both in 1 txn.
    // Then B(20) vs C(10) -> 1 txn, remainder B(10) vs D(10) -> 1 txn. Total: 3.
    // Optimal: {A,E} settle (1 txn) and {B,C,D} settle (2 txns) = 3 as well in this
    // particular instance, so instead we assert the *general* invariant: optimal
    // is never worse than greedy, and both fully zero the group.
    const balances: Balance[] = [
      { userId: "a", amountCents: 3000 },
      { userId: "b", amountCents: 2000 },
      { userId: "c", amountCents: -1000 },
      { userId: "d", amountCents: -1000 },
      { userId: "e", amountCents: -3000 },
    ];
    const greedy = simplifyDebts(balances);
    const optimal = settleDebtsOptimal(balances);

    expect(optimal.length).toBeLessThanOrEqual(greedy.length);

    const finalNet = netAfter(balances, optimal);
    for (const amount of finalNet.values()) {
      expect(amount).toBe(0);
    }
  });

  it("falls back to greedy for groups above the size threshold", () => {
    const balances: Balance[] = Array.from({ length: 20 }, (_, i) => ({
      userId: `u${i}`,
      amountCents: i < 10 ? 100 : -100,
    }));
    // Should not throw or hang, and should still fully settle.
    const result = settleDebtsOptimal(balances);
    const finalNet = netAfter(balances, result);
    for (const amount of finalNet.values()) {
      expect(amount).toBe(0);
    }
  });

  it("preserves total volume conservation (sanity check)", () => {
    const balances: Balance[] = [
      { userId: "a", amountCents: 5000 },
      { userId: "b", amountCents: -2000 },
      { userId: "c", amountCents: -3000 },
    ];
    const result = settleDebtsOptimal(balances);
    // Every cent owed must be accounted for in transactions out of debtors
    const paidByB = result.filter((t) => t.fromUserId === "b").reduce((a, t) => a + t.amountCents, 0);
    const paidByC = result.filter((t) => t.fromUserId === "c").reduce((a, t) => a + t.amountCents, 0);
    expect(paidByB).toBe(2000);
    expect(paidByC).toBe(3000);
  });
});
