# Split

A shared-expense tracker that does what Splitwise does, minus the bloat — and with the one feature that's actually interesting to build: turning a tangle of who-owes-who into the **minimum number of payments** needed to settle a group up.

**Live demo:** _add your deployed URL here_
**Stack:** React + TypeScript · Node/Express · PostgreSQL · Socket.io

---

## Why this project

Most "expense splitter" tutorials stop at storing who paid for what. The part that's actually worth showing in an interview is what happens *after* that: given a group's full history of expenses, what's the smallest set of transactions that settles everyone to zero? That's a real algorithmic problem (related to subset-sum / multi-way number partitioning), and this repo implements two solutions to it:

1. **A greedy O(n log n) algorithm** (`server/src/algorithms/settleDebts.ts`) — always correct, not always minimal, used by default for any group size.
2. **An exact exponential-time algorithm** (`server/src/algorithms/settleDebtsOptimal.ts`) — finds the true minimum transaction count via subset partitioning, gated to groups of 12 or fewer people where it's still fast (under that, 2¹² = 4096 subsets to check).

Both are unit tested in isolation from the rest of the app (`server/src/__tests__/settleDebts.test.ts`), because the algorithm is the part of this codebase that should be trusted the most.

## Architecture

```
client/  React + TypeScript + Tailwind, talks to the API over REST + a Socket.io
         connection for live balance updates when group members add expenses.

server/  Express + TypeScript REST API, PostgreSQL via the pg driver (no ORM —
         schema and queries are explicit and visible), Socket.io for real-time
         push, JWT auth.

         src/algorithms/   the settlement engine — pure functions, no I/O,
                            fully unit tested.
         src/routes/       HTTP handlers, thin — validation + DB calls only.
         src/db/           schema.sql + migration runner.
         src/sockets/      real-time event wiring.
```

### Data flow for "what do I owe?"

1. Every expense is stored with its *shares* — how much of that specific expense each participant owes (`expense_shares` table). Shares are computed once at creation time using rounding-safe integer-cent math (see "Why integer cents" below) and stored, not recalculated on every read.
2. `computeNetBalances()` folds all of a group's expenses into one net balance per person: positive means "is owed money," negative means "owes money." Recorded settlements (people who already paid each other back) are folded in afterward.
3. `simplifyDebts()` / `settleDebtsOptimal()` take those net balances and produce the actual list of "X pays Y $Z" transactions.
4. The client renders that list and lets someone mark a transaction as paid, which writes a `settlements` row and pushes a `settlement:recorded` event over the group's Socket.io room so every connected member's UI updates without a refresh.

## Notable design decisions

**Why integer cents, not floats or `DECIMAL`.** Every amount in this codebase — in the database (`BIGINT`), in the algorithm, in the API payloads — is an integer number of cents. Splitting $10.00 three ways with floating point gives you `3.333333...`, and naive rounding either loses a penny or invents one. `splitEqually()` and `splitByPercentage()` in `server/src/routes/expenses.ts` instead compute the integer-floor share for everyone and then explicitly hand out the leftover pennies (by largest fractional remainder, for percentage splits) so shares always sum to *exactly* the original total. There's a test and a DB trigger (`check_expense_shares_sum`) that both enforce this invariant.

**Why a DB trigger in addition to application-level checks.** `server/src/db/schema.sql` has a deferred constraint trigger that re-validates "do this expense's shares sum to its total?" after every insert/update/delete on `expense_shares`. The application already checks this, but defense in depth here is cheap and catches bugs that bypass the API (a bad migration, a manual `psql` fix, a future second API surface).

**Why greedy by default, exact only for small groups.** The exact algorithm is exponential in the number of people with a nonzero balance. For a 4-person group it's instant; for a 12-person group it's still fast; beyond that it would get slow, so the service layer (`balancesService.ts`) automatically falls back to the greedy algorithm above `MAX_OPTIMAL_GROUP_SIZE`. This is the kind of tradeoff worth raising in an interview unprompted — it shows you thought about the algorithm's complexity rather than just making it work on the happy path.

**Why no ORM.** With only five tables and one truly nontrivial invariant (shares summing correctly), explicit SQL kept the schema's constraints visible in one file instead of scattered across decorators or migration DSLs. This was a deliberate choice for a project this size, not a default.

## Running it locally

### Prerequisites
- Node 20+
- PostgreSQL running locally (or a connection string to a hosted instance)

### Setup

```bash
# 1. Database
createdb split_dev
cd server
cp .env.example .env        # edit DATABASE_URL if needed
npm install
npm run db:migrate

# 2. Server
npm run dev                 # http://localhost:4000

# 3. Client (new terminal)
cd ../client
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

### Running the tests

```bash
cd server
npm test
```

14 tests covering: basic settlement correctness, the "balances must zero out" invariant, the "(n-1) transactions max" bound, floating-point-free behavior at scale, upstream-bug guards (unbalanced input throws instead of producing a silently wrong plan), and a direct comparison between the greedy and exact algorithms.

## What I'd build next

- Multi-currency support with live exchange rates at expense-creation time (storing the converted amount, not a live-recalculated one, to keep historical expenses stable)
- Recurring expenses
- Receipt photo upload, with OCR as a stretch goal for auto-filling the amount
- Member-removal handling — currently the schema assumes the group's membership is stable; removing someone with an outstanding balance needs a defined policy (settle first? transfer their balance?) that I haven't built yet

## License

MIT
