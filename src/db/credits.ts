import { kv } from '@vercel/kv';

/**
 * Credit System Database Module
 * 
 * Manages user credits using Vercel KV (Redis).
 * Key format: credits:{userId}
 * Value: number (credit balance)
 */

const CREDIT_KEY_PREFIX = 'credits:';

/**
 * Get the credit balance for a user
 * @param userId - User identifier (phone number)
 * @returns Current credit balance (0 if user doesn't exist)
 */
export async function getUserCredits(userId: string): Promise<number> {
  try {
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    const credits = await kv.get<number>(key);
    return credits ?? 0;
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
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    
    // Use atomic decrement to prevent race conditions
    const newBalance = await kv.decr(key);
    
    // If balance went negative, increment it back and return failure
    if (newBalance < 0) {
      await kv.incr(key);
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
    
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    
    // Use atomic increment
    const newBalance = await kv.incrby(key, amount);
    
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
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    const exists = await kv.exists(key);
    
    if (!exists) {
      await kv.set(key, 0);
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
    
    const key = `${CREDIT_KEY_PREFIX}${userId}`;
    await kv.set(key, amount);
    
    console.log(`[credits:setCredits] Set ${userId} balance to ${amount} credits`);
    
    return amount;
  } catch (error) {
    console.error('[credits:setCredits]', error);
    throw new Error('Failed to set credits');
  }
}

/**
 * Check if Vercel KV is properly configured and accessible
 * @returns true if KV is accessible, false otherwise
 */
export async function checkKVConnection(): Promise<boolean> {
  try {
    const testKey = 'health:check';
    await kv.set(testKey, Date.now(), { ex: 10 }); // Expires in 10 seconds
    await kv.get(testKey);
    return true;
  } catch (error) {
    console.error('[credits:checkKVConnection]', error);
    return false;
  }
}

