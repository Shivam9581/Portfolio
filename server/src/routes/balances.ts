import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { AuthedRequest, requireAuth } from "../middleware/auth.js";
import { getGroupBalances, getSettlementPlan } from "../algorithms/balancesService.js";
import { getIO } from "../sockets/io.js";

export const balancesRouter = Router();
balancesRouter.use(requireAuth);

balancesRouter.get("/group/:groupId", async (req: AuthedRequest, res) => {
  try {
    const balances = await getGroupBalances(req.params.groupId);
    res.json({ balances });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compute balances" });
  }
});

balancesRouter.get("/group/:groupId/settlement-plan", async (req: AuthedRequest, res) => {
  try {
    const { balances, plan } = await getSettlementPlan(req.params.groupId);
    res.json({ balances, plan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compute settlement plan" });
  }
});

const recordSettlementSchema = z.object({
  groupId: z.string().uuid(),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  amountCents: z.number().int().positive(),
});

balancesRouter.post("/settlements", async (req: AuthedRequest, res) => {
  const parsed = recordSettlementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { groupId, fromUserId, toUserId, amountCents } = parsed.data;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_cents, recorded_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [groupId, fromUserId, toUserId, amountCents, req.userId]
  );

  getIO()?.to(`group:${groupId}`).emit("settlement:recorded", {
    settlementId: result.rows[0].id,
    groupId,
  });

  res.status(201).json({ settlementId: result.rows[0].id });
});
