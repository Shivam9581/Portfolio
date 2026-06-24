import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { signToken } from "../middleware/auth.js";

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(80),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password, displayName } = parsed.data;

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3) RETURNING id`,
    [email, passwordHash, displayName]
  );

  const userId = result.rows[0].id;
  const token = signToken(userId);

  res.status(201).json({ token, user: { id: userId, email, displayName } });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const result = await pool.query<{
    id: string;
    password_hash: string;
    display_name: string;
  }>("SELECT id, password_hash, display_name FROM users WHERE email = $1", [email]);

  // Same error for "no such user" and "wrong password" — don't leak
  // which one it was, that's a user-enumeration vector.
  const genericError = { error: "Invalid email or password" };

  if (result.rows.length === 0) {
    return res.status(401).json(genericError);
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json(genericError);
  }

  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, email, displayName: user.display_name } });
});
