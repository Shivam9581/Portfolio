import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
