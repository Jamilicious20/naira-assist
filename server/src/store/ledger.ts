/**
 * Read-only view of a user's wallet. In production this would call the backend
 * team's ledger service; amounts are integers in kobo to avoid floating-point errors.
 */
export interface Transaction {
  id: string;
  type: "credit" | "debit";
  amountKobo: number;
  description: string;
  createdAt: string; // ISO 8601
  status: "successful" | "pending" | "failed";
}

export interface Wallet {
  userId: string;
  currency: "NGN";
  balanceKobo: number;
}

export interface LedgerRepository {
  getWallet(userId: string): Promise<Wallet>;
  listTransactions(userId: string, opts?: { limit?: number; type?: Transaction["type"] }): Promise<Transaction[]>;
}

/** Demo ledger: each new user gets the same seeded history so the app is explorable. */
export class InMemoryLedger implements LedgerRepository {
  private readonly txns = new Map<string, Transaction[]>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private seed(userId: string): Transaction[] {
    const existing = this.txns.get(userId);
    if (existing) return existing;
    const day = 86_400_000;
    const t = this.now().getTime();
    const rows: Omit<Transaction, "id" | "createdAt">[] = [
      { type: "credit", amountKobo: 25_000_000, description: "Salary - Ilelah Technologies", status: "successful" },
      { type: "debit", amountKobo: 1_000_000, description: "MTN airtime", status: "successful" },
      { type: "debit", amountKobo: 3_500_000, description: "Electricity - JED prepaid", status: "successful" },
      { type: "debit", amountKobo: 5_000_000, description: "Transfer to Amina Yusuf", status: "pending" },
      { type: "credit", amountKobo: 1_500_000, description: "Refund - failed data purchase", status: "successful" },
      { type: "debit", amountKobo: 250_000, description: "Glo data 1GB", status: "failed" },
    ];
    const txns = rows.map((r, i) => ({
      ...r,
      id: `txn_${userId.slice(0, 6)}_${i + 1}`,
      createdAt: new Date(t - (rows.length - i) * day).toISOString(),
    }));
    txns.reverse(); // newest first
    this.txns.set(userId, txns);
    return txns;
  }

  async getWallet(userId: string): Promise<Wallet> {
    const balanceKobo = this.seed(userId)
      .filter((t) => t.status === "successful")
      .reduce((sum, t) => sum + (t.type === "credit" ? t.amountKobo : -t.amountKobo), 0);
    return { userId, currency: "NGN", balanceKobo };
  }

  async listTransactions(userId: string, opts: { limit?: number; type?: Transaction["type"] } = {}) {
    const { limit = 10, type } = opts;
    return this.seed(userId)
      .filter((t) => !type || t.type === type)
      .slice(0, limit);
  }
}

export const formatNaira = (kobo: number): string =>
  `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
