import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:4000";

/**
 * Joins a group's real-time room and invokes onUpdate whenever the
 * server signals a change (new expense, deleted expense, settlement
 * recorded). The consumer decides what "update" means — typically
 * re-fetching balances.
 */
export function useGroupSocket(groupId: string | undefined, onUpdate: () => void) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!groupId) return;

    const token = localStorage.getItem("split_token");
    if (!token) return;

    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.emit("group:join", groupId);

    socket.on("expense:created", onUpdate);
    socket.on("expense:deleted", onUpdate);
    socket.on("settlement:recorded", onUpdate);

    return () => {
      socket.emit("group:leave", groupId);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
}
