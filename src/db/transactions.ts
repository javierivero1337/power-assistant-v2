import { createClient, RedisClientType } from 'redis';

/**
 * Transaction Log Module
 * 
 * Stores Stripe credit purchase transactions for auditing.
 * Uses a Redis sorted set keyed by timestamp for efficient retrieval.
 */

const TRANSACTIONS_KEY = 'credits:txns';
const USER_TRANSACTIONS_PREFIX = 'credits:txns:user:';

// Redis client singleton (shared with credits.ts pattern)
let redis: RedisClientType | null = null;

export interface CreditTransaction {
  id: string;           // Stripe session ID or unique identifier
  userId: string;       // Phone number
  creditsAdded: number;
  amountPaid: number;   // In cents (0 for free trials)
  currency: string;
  createdAt: number;    // Unix timestamp ms
  email?: string;
  type?: 'purchase' | 'free_trial' | 'admin_grant';  // Transaction type for analytics
}

/**
 * Get or create Redis client connection
 */
async function getRedisClient(): Promise<RedisClientType> {
  if (redis && redis.isOpen) {
    return redis;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  redis = createClient({ url: redisUrl });
  
  redis.on('error', (err) => {
    console.error('[redis:error]', err);
  });

  await redis.connect();
  return redis;
}

/**
 * Log a credit transaction
 */
export async function logTransaction(txn: CreditTransaction): Promise<void> {
  try {
    const client = await getRedisClient();
    const txnJson = JSON.stringify(txn);
    
    // Add to global sorted set (score = timestamp for ordering)
    await client.zAdd(TRANSACTIONS_KEY, {
      score: txn.createdAt,
      value: txnJson,
    });
    
    // Also add to user-specific sorted set for filtering
    const userKey = `${USER_TRANSACTIONS_PREFIX}${txn.userId}`;
    await client.zAdd(userKey, {
      score: txn.createdAt,
      value: txnJson,
    });
    
    console.log(`[transactions:log] Logged transaction ${txn.id} for ${txn.userId}`);
  } catch (error) {
    console.error('[transactions:log]', error);
    throw new Error('Failed to log transaction');
  }
}

/**
 * Get all transactions, optionally filtered by userId
 * Returns newest first
 */
export async function getTransactions(options?: {
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ transactions: CreditTransaction[]; total: number }> {
  try {
    const client = await getRedisClient();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    
    let key = TRANSACTIONS_KEY;
    if (options?.userId) {
      key = `${USER_TRANSACTIONS_PREFIX}${options.userId}`;
    }
    
    // Get total count
    const total = await client.zCard(key);
    
    // Get transactions in reverse order (newest first)
    const results = await client.zRange(key, '+inf', '-inf', {
      BY: 'SCORE',
      REV: true,
      LIMIT: { offset, count: limit },
    });
    
    const transactions = results.map((json) => JSON.parse(json) as CreditTransaction);
    
    return { transactions, total };
  } catch (error) {
    console.error('[transactions:get]', error);
    throw new Error('Failed to retrieve transactions');
  }
}

/**
 * Get transaction statistics
 */
export async function getTransactionStats(): Promise<{
  totalTransactions: number;
  totalCreditsIssued: number;
  totalRevenue: number;
  uniqueUsers: number;
  lastTransactionAt: number | null;
}> {
  try {
    const client = await getRedisClient();
    
    // Get all transactions for stats calculation
    const allTxns = await client.zRange(TRANSACTIONS_KEY, 0, -1);
    
    if (allTxns.length === 0) {
      return {
        totalTransactions: 0,
        totalCreditsIssued: 0,
        totalRevenue: 0,
        uniqueUsers: 0,
        lastTransactionAt: null,
      };
    }
    
    const transactions = allTxns.map((json) => JSON.parse(json) as CreditTransaction);
    const uniqueUserIds = new Set(transactions.map((t) => t.userId));
    
    const totalCreditsIssued = transactions.reduce((sum, t) => sum + t.creditsAdded, 0);
    const totalRevenue = transactions.reduce((sum, t) => sum + t.amountPaid, 0);
    
    // Get the most recent transaction timestamp
    const lastTxn = await client.zRange(TRANSACTIONS_KEY, -1, -1);
    let lastTransactionAt: number | null = null;
    if (lastTxn.length > 0) {
      const parsed = JSON.parse(lastTxn[0]) as CreditTransaction;
      lastTransactionAt = parsed.createdAt;
    }
    
    return {
      totalTransactions: transactions.length,
      totalCreditsIssued,
      totalRevenue,
      uniqueUsers: uniqueUserIds.size,
      lastTransactionAt,
    };
  } catch (error) {
    console.error('[transactions:stats]', error);
    throw new Error('Failed to retrieve transaction stats');
  }
}

/**
 * Get transactions for a specific user with their current balance
 */
export async function getUserTransactionHistory(userId: string): Promise<{
  transactions: CreditTransaction[];
  totalCreditsFromPurchases: number;
}> {
  try {
    const { transactions } = await getTransactions({ userId, limit: 100 });
    const totalCreditsFromPurchases = transactions.reduce((sum, t) => sum + t.creditsAdded, 0);
    
    return {
      transactions,
      totalCreditsFromPurchases,
    };
  } catch (error) {
    console.error('[transactions:userHistory]', error);
    throw new Error('Failed to retrieve user transaction history');
  }
}

