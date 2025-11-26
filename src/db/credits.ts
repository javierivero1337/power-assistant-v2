import { createClient, RedisClientType } from 'redis';

/**
 * Credit System Database Module
 * 
 * Manages user credits using Redis (via Upstash/Vercel).
 * Key format: credits:{userId}
 * Value: number (credit balance)
 */

const CREDIT_KEY_PREFIX = 'credits:';

// Redis client singleton
let redis: RedisClientType | null = null;

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
 * Get the credit balance for a user
 * @param userId - User identifier (phone number)
 * @returns Current credit balance (0 if user doesn't exist)
 */
export async function getUserCredits(userId: string): Promise<number> {
  try {
    const client = await getRedisClient();
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    const credits = await client.get(key);
    return credits ? parseInt(credits, 10) : 0;
  } catch (error) {
    console.error('[credits:getUserCredits]', error);
    throw new Error('Failed to retrieve user credits');
  }
}

/**
 * Deduct one credit from a user's balance
 * @param userId - User identifier (phone number)
 * @returns Object with success status and remaining credits
 */
export async function deductCredit(
  userId: string
): Promise<{ success: boolean; remaining: number }> {
  try {
    const client = await getRedisClient();
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    
    // Use atomic decrement to prevent race conditions
    const newBalance = await client.decr(key);
    
    // If balance went negative, increment it back and return failure
    if (newBalance < 0) {
      await client.incr(key);
      return { success: false, remaining: 0 };
    }
    
    return { success: true, remaining: newBalance };
  } catch (error) {
    console.error('[credits:deductCredit]', error);
    throw new Error('Failed to deduct credit');
  }
}

/**
 * Add credits to a user's balance
 * @param userId - User identifier (phone number)
 * @param amount - Number of credits to add
 * @returns New credit balance
 */
export async function addCredits(
  userId: string,
  amount: number
): Promise<number> {
  try {
    if (amount <= 0) {
      throw new Error('Credit amount must be positive');
    }
    
    const client = await getRedisClient();
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    
    // Use atomic increment
    const newBalance = await client.incrBy(key, amount);
    
    console.log(`[credits:addCredits] Added ${amount} credits to ${userId}. New balance: ${newBalance}`);
    
    return newBalance;
  } catch (error) {
    console.error('[credits:addCredits]', error);
    throw new Error('Failed to add credits');
  }
}

/**
 * Initialize a new user with 0 credits
 * @param userId - User identifier (phone number)
 */
export async function initializeUser(userId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    const exists = await client.exists(key);
    
    if (!exists) {
      await client.set(key, '0');
      console.log(`[credits:initializeUser] Initialized user ${userId} with 0 credits`);
    }
  } catch (error) {
    console.error('[credits:initializeUser]', error);
    throw new Error('Failed to initialize user');
  }
}

/**
 * Set a user's credit balance to a specific amount (for admin use)
 * @param userId - User identifier (phone number)
 * @param amount - Credit balance to set
 * @returns New credit balance
 */
export async function setCredits(
  userId: string,
  amount: number
): Promise<number> {
  try {
    if (amount < 0) {
      throw new Error('Credit amount cannot be negative');
    }
    
    const client = await getRedisClient();
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    await client.set(key, amount.toString());
    
    console.log(`[credits:setCredits] Set ${userId} balance to ${amount} credits`);
    
    return amount;
  } catch (error) {
    console.error('[credits:setCredits]', error);
    throw new Error('Failed to set credits');
  }
}

/**
 * Delete a user's credit record entirely
 * @param userId - User identifier (phone number)
 * @returns true if deleted, false if user didn't exist
 */
export async function deleteUser(userId: string): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    const deleted = await client.del(key);
    
    console.log(`[credits:deleteUser] Deleted user ${userId}: ${deleted > 0}`);
    
    return deleted > 0;
  } catch (error) {
    console.error('[credits:deleteUser]', error);
    throw new Error('Failed to delete user');
  }
}

/**
 * Check if Redis is properly configured and accessible
 * @returns true if Redis is accessible, false otherwise
 */
export async function checkKVConnection(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const testKey = 'health:check';
    await client.set(testKey, Date.now().toString(), { EX: 10 }); // Expires in 10 seconds
    await client.get(testKey);
    return true;
  } catch (error) {
    console.error('[credits:checkKVConnection]', error);
    return false;
  }
}

/**
 * Get all users with their credit balances
 * @returns Array of users with their credits
 */
export async function getAllUsersWithCredits(): Promise<Array<{ userId: string; credits: number }>> {
  try {
    const client = await getRedisClient();
    
    // Scan for all credit keys
    const keys: string[] = [];
    let cursor: string = '0';
    
    do {
      const result = await client.scan(cursor, {
        MATCH: `${CREDIT_KEY_PREFIX}*`,
        COUNT: 100,
      });
      cursor = String(result.cursor);
      keys.push(...result.keys);
    } while (cursor !== '0');
    
    if (keys.length === 0) {
      return [];
    }
    
    // Get all credit values
    const users: Array<{ userId: string; credits: number }> = [];
    
    for (const key of keys) {
      const credits = await client.get(key);
      const userId = key.replace(CREDIT_KEY_PREFIX, '');
      users.push({
        userId,
        credits: credits ? parseInt(credits, 10) : 0,
      });
    }
    
    // Sort by credits descending
    users.sort((a, b) => b.credits - a.credits);
    
    return users;
  } catch (error) {
    console.error('[credits:getAllUsersWithCredits]', error);
    throw new Error('Failed to retrieve all users with credits');
  }
}
