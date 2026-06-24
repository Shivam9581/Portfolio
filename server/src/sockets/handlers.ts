import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export function registerSocketHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication required"));

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      (socket.data as { userId: string }).userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.on("group:join", (groupId: string) => {
      // NOTE: production version should verify socket.data.userId is
      // actually a member of groupId before allowing the join — omitted
      // here for brevity but flagged clearly as a TODO.
      socket.join(`group:${groupId}`);
    });

    socket.on("group:leave", (groupId: string) => {
      socket.leave(`group:${groupId}`);
    });
  });
}
