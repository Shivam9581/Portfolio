import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { AuthedRequest, requireAuth } from "../middleware/auth.js";
import { getIO } from "../sockets/io.js";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

const baseExpenseSchema = z.object({
  groupId: z.string().uuid(),
  description: z.string().min(1).max(200),
  totalCents: z.number().int().positive(),
  paidByUserId: z.string().uuid(),
});

const equalSplitSchema = baseExpenseSchema.extend({
  splitType: z.literal("equal"),
  participantUserIds: z.array(z.string().uuid()).min(1),
});

const percentageSplitSchema = baseExpenseSchema.extend({
  splitType: z.literal("percentage"),
  shares: z.array(z.object({ userId: z.string().uuid(), percentage: z.number().min(0).max(100) })),
});

const exactSplitSchema = baseExpenseSchema.extend({
  splitType: z.literal("exact"),
  shares: z.array(z.object({ userId: z.string().uuid(), amountCents: z.number().int().nonnegative() })),
});

const createExpenseSchema = z.discriminatedUnion("splitType", [
  equalSplitSchema,
  percentageSplitSchema,
  exactSplitSchema,
]);

/**
 * Splits totalCents evenly among n participants WITHOUT losing or
 * fabricating pennies. Standard integer division leaves a remainder
 * (e.g. $10.00 / 3 = 333.33...). We give the remainder cents to the
 * first `remainder` participants, one extra cent each, so the shares
 * always sum EXACTLY to totalCents.
 */
function splitEqually(totalCents: number, participantUserIds: string[]) {
  const n = participantUserIds.length;
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;

  return participantUserIds.map((userId, i) => ({
    userId,
    shareCents: base + (i < remainder ? 1 : 0),
  }));
}

/**
 * Converts percentage shares to cents, again distributing rounding
 * remainder rather than silently losing pennies.
 */
function splitByPercentage(totalCents: number, shares: { userId: string; percentage: number }[]) {
  const totalPercentage = shares.reduce((a, s) => a + s.percentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(`Percentages must sum to 100, got ${totalPercentage}`);
  }

  const raw = shares.map((s) => ({
    userId: s.userId,
    exact: (totalCents * s.percentage) / 100,
  }));

  const floored = raw.map((r) => ({ userId: r.userId, shareCents: Math.floor(r.exact) }));
  const distributed = floored.reduce((a, f) => a + f.shareCents, 0);
  let remainder = totalCents - distributed;

  // Give remaining cents to whoever had the largest fractional part —
  // minimizes total rounding "unfairness" across the group.
  const byFraction = raw
    .map((r, i) => ({ i, frac: r.exact - Math.floor(r.exact) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < byFraction.length && remainder > 0; k++) {
    floored[byFraction[k].i].shareCents += 1;
    remainder--;
  }

  return floored;
}

expensesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data = parsed.data;

  let shares: { userId: string; shareCents: number }[];
  try {
    if (data.splitType === "equal") {
      shares = splitEqually(data.totalCents, data.participantUserIds);
    } else if (data.splitType === "percentage") {
      shares = splitByPercentage(data.totalCents, data.shares);
    } else {
      shares = data.shares.map((s) => ({ userId: s.userId, shareCents: s.amountCents }));
      const sum = shares.reduce((a, s) => a + s.shareCents, 0);
      if (sum !== data.totalCents) {
        return res.status(400).json({
          error: `Exact shares sum to ${sum} cents but total is ${data.totalCents} cents`,
        });
      }
    }
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const expenseResult = await client.query<{ id: string }>(
      `INSERT INTO expenses (group_id, description, total_cents, paid_by_user_id, split_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [data.groupId, data.description, data.totalCents, data.paidByUserId, data.splitType, req.userId]
    );
    const expenseId = expenseResult.rows[0].id;

    for (const share of shares) {
      await client.query(
        `INSERT INTO expense_shares (expense_id, user_id, share_cents) VALUES ($1, $2, $3)`,
        [expenseId, share.userId, share.shareCents]
      );
    }

    await client.query("COMMIT");

    // Notify everyone in the group in real time so balances refresh live.
    getIO()?.to(`group:${data.groupId}`).emit("expense:created", {
      expenseId,
      groupId: data.groupId,
    });

    res.status(201).json({ expenseId, shares });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to create expense. " + (err as Error).message });
  } finally {
    client.release();
  }
});

expensesRouter.get("/group/:groupId", async (req: AuthedRequest, res) => {
  const { groupId } = req.params;
  const result = await pool.query(
    `SELECT e.id, e.description, e.total_cents, e.paid_by_user_id, e.split_type, e.created_at,
            u.display_name AS paid_by_name
     FROM expenses e
     JOIN users u ON u.id = e.paid_by_user_id
     WHERE e.group_id = $1 AND e.deleted_at IS NULL
     ORDER BY e.created_at DESC`,
    [groupId]
  );
  res.json({ expenses: result.rows });
});

expensesRouter.delete("/:expenseId", async (req: AuthedRequest, res) => {
  const { expenseId } = req.params;
  const result = await pool.query(
    `UPDATE expenses SET deleted_at = now() WHERE id = $1 RETURNING group_id`,
    [expenseId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Expense not found" });

  const groupId = result.rows[0].group_id;
  getIO()?.to(`group:${groupId}`).emit("expense:deleted", { expenseId, groupId });

  res.status(204).send();
});
