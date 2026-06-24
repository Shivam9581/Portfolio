import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { AuthedRequest, requireAuth } from "../middleware/auth.js";

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

const createGroupSchema = z.object({
  name: z.string().min(1).max(120),
  currency: z.string().length(3).default("USD"),
  memberEmails: z.array(z.string().email()).default([]),
});

groupsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { name, currency, memberEmails } = parsed.data;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const groupResult = await client.query<{ id: string }>(
      `INSERT INTO groups (name, currency, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [name, currency, req.userId]
    );
    const groupId = groupResult.rows[0].id;

    // Creator is always a member
    await client.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)`,
      [groupId, req.userId]
    );

    if (memberEmails.length > 0) {
      const usersResult = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
        [memberEmails]
      );

      const foundEmails = new Set(usersResult.rows.map((r) => r.email));
      const notFound = memberEmails.filter((e) => !foundEmails.has(e));

      for (const user of usersResult.rows) {
        await client.query(
          `INSERT INTO group_members (group_id, user_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [groupId, user.id]
        );
      }

      await client.query("COMMIT");
      return res.status(201).json({ groupId, notFoundEmails: notFound });
    }

    await client.query("COMMIT");
    res.status(201).json({ groupId, notFoundEmails: [] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to create group" });
  } finally {
    client.release();
  }
});

groupsRouter.get("/", async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT g.id, g.name, g.currency, g.created_at
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.user_id = $1
     ORDER BY g.created_at DESC`,
    [req.userId]
  );
  res.json({ groups: result.rows });
});

groupsRouter.get("/:groupId", async (req: AuthedRequest, res) => {
  const { groupId } = req.params;

  const membership = await pool.query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, req.userId]
  );
  if (membership.rows.length === 0) {
    return res.status(403).json({ error: "You are not a member of this group" });
  }

  const group = await pool.query(`SELECT id, name, currency, created_at FROM groups WHERE id = $1`, [
    groupId,
  ]);
  const members = await pool.query(
    `SELECT u.id, u.display_name, u.email
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1`,
    [groupId]
  );

  res.json({ group: group.rows[0], members: members.rows });
});
