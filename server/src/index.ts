import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

import { authRouter } from "./routes/auth.js";
import { groupsRouter } from "./routes/groups.js";
import { expensesRouter } from "./routes/expenses.js";
import { balancesRouter } from "./routes/balances.js";
import { setIO } from "./sockets/io.js";
import { registerSocketHandlers } from "./sockets/handlers.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/groups", groupsRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/balances", balancesRouter);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" },
});

setIO(io);
registerSocketHandlers(io);

const PORT = process.env.PORT ?? 4000;
httpServer.listen(PORT, () => {
  console.log(`Split server listening on port ${PORT}`);
});
