/**
 * Request Queue & Exponential Backoff
 * Prevents overwhelming external APIs with concurrent requests
 */

class RequestQueue {
  constructor(maxConcurrent = 3, delayMs = 200) {
    this.maxConcurrent = maxConcurrent;
    this.delayMs = delayMs;
    this.queue = [];
    this.running = 0;
  }

  async execute(fn, maxRetries = 3) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, maxRetries, resolve, reject, attempt: 0 });
      this.process();
    });
  }

  async process() {
    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const { fn, maxRetries, resolve, reject, attempt } = this.queue.shift();
      this.running++;

      try {
        // Small delay to avoid request bunching
        await new Promise(r => setTimeout(r, this.delayMs));
        
        const result = await fn();
        resolve(result);
      } catch (err) {
        if (attempt < maxRetries) {
          // Exponential backoff: 500ms, 1000ms, 2000ms
          const waitTime = Math.min(500 * Math.pow(2, attempt), 5000);
          console.warn(
            `⚠️  Request failed (attempt ${attempt + 1}/${maxRetries}). ` +
            `Retrying in ${waitTime}ms...`
          );
          
          setTimeout(() => {
            this.queue.unshift({
              fn, maxRetries, resolve, reject,
              attempt: attempt + 1
            });
            this.process();
          }, waitTime);
        } else {
          reject(new Error(`Request failed after ${maxRetries} attempts: ${err.message}`));
        }
      } finally {
        this.running--;
        this.process();
      }
    }
  }
}

// Shared queue for price/prediction requests
export const apiQueue = new RequestQueue(3, 200);

/**
 * Retry helper with exponential backoff
 */
export async function retryWithBackoff(fn, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      // Don't retry on 401/403 auth errors or 404 not found
      if (err?.response?.status === 401 ||
          err?.response?.status === 403 ||
          err?.response?.status === 404) {
        throw err;
      }

      if (attempt < maxRetries - 1) {
        const waitTime = Math.min(500 * Math.pow(2, attempt), 5000);
        console.warn(
          `Retry ${attempt + 1}/${maxRetries - 1} after ${waitTime}ms...`
        );
        await new Promise(r => setTimeout(r, waitTime));
      }
    }
  }
  
  throw lastError;
}

/**
 * Batch request executor with staggered delays
 * Used for compare operations (e.g., AAPL vs TSLA vs NVDA)
 */
export async function executeBatchRequests(requests, delayBetweenMs = 300) {
  const results = [];
  
  for (let i = 0; i < requests.length; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, delayBetweenMs));
    }
    
    try {
      const result = await requests[i]();
      results.push({ success: true, data: result });
    } catch (err) {
      results.push({
        success: false,
        error: err?.message || 'Unknown error'
      });
    }
  }
  
  return results;
}
