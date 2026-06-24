export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Group {
  id: string;
  name: string;
  currency: string;
  created_at: string;
}

export interface Member {
  id: string;
  display_name: string;
  email: string;
}

export interface Expense {
  id: string;
  description: string;
  total_cents: string; // bigint comes back as string from pg
  paid_by_user_id: string;
  paid_by_name: string;
  split_type: "equal" | "percentage" | "exact";
  created_at: string;
}

export interface Balance {
  userId: string;
  amountCents: number;
}

export interface SettlementTransaction {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}
