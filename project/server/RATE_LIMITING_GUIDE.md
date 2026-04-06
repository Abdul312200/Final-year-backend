# Rate Limiting & Request Throttling Guide

## Overview
This document explains the rate limiting and request throttling mechanisms implemented to prevent HTTP 429 (Too Many Requests) errors in the FinTechIQ chatbot.

## Features

### 1. **Server-Side Rate Limiting** (`rate-limiter.js`)
- **Global Limiter**: 30 requests per 15 minutes per IP
- **Chatbot Limiter**: 20 requests per 10 minutes per user
- **Prediction Limiter**: 15 requests per 5 minutes per user
- **Price Limiter**: 10 requests per 2 minutes per user

### 2. **Request Queue & Exponential Backoff** (`request-queue.js`)
- **Request Queue**: Limits concurrent API calls to 3 at a time
- **Delay Between Requests**: 200ms between each request
- **Exponential Backoff**: Retries with increasing delays (500ms → 1000ms → 2000ms)
- **Max Retries**: 3 attempts with exponential backoff

### 3. **Client-Side Throttling** (`Chatbot.jsx`)
- **Request Throttle**: Minimum 500ms between messages
- **Rapid-Fire Protection**: Silently ignores requests faster than 500ms
- **429 Error Handling**: User-friendly messages when rate limited

### 4. **Batch Request Execution**
- **Staggered Delays**: 300ms between requests in batch operations
- **Comparison Optimization**: Splits large comparisons into sequential requests

## Error Handling

### Server-Side (429 Responses)
When a 429 error occurs:
1. The `retryWithBackoff()` function waits before retrying
2. Waits with exponential backoff: 500ms, 1s, 2s
3. If all retries fail after 3 attempts, returns error to client
4. Special handling for `/compare` endpoint logs warning

### Client-Side (429 Responses)
When the client receives a 429 error:
1. Displays localized error message (EN/TA/Tanglish)
2. Suggests waiting before trying again
3. For comparisons: Suggests comparing fewer stocks at a time

## Configuration

### Environment Variables (.env)
```bash
# Skip rate limiting in development (default: false)
SKIP_RATE_LIMIT=false

# ML Service endpoints
ML_SERVICE=https://final-year-backend-2.onrender.com
LOCAL_ML=http://127.0.0.1:8000
LOCAL_PRICE=http://127.0.0.1:5001

# Enable verbose logging for rate limit events
DEBUG_RATE_LIMIT=true
```

### Customizing Limits

Edit `rate-limiter.js` to adjust limits:

```javascript
// Example: Increase chatbot limit to 30 per 15 minutes
export const chatbotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // Change window size
  max: 30,                    // Change request count
  keyGenerator: (req) => req.body?.userId || req.ip,
  message: '⚠️ Too many requests. Please wait.',
  skip: (req) => !req.body?.userId,
});
```

Edit `request-queue.js` to adjust queue behavior:

```javascript
// Example: Reduce concurrent requests to 2
const apiQueue = new RequestQueue(2, 300);  // max concurrent, delay ms
```

## Best Practices

### For Users
1. **Avoid rapid requests**: Wait at least 1 second between messages
2. **Limit comparisons**: Compare 2-3 stocks at a time, not 10+
3. **Batch operations**: Don't train multiple models simultaneously
4. **Check status**: Use `/api/llm-status` to check service health first

### For Developers
1. **Use apiQueue** for any external API calls
2. **Implement retryWithBackoff** for important operations
3. **Use executeBatchRequests** for operations on multiple items
4. **Log 429 errors** for monitoring and debugging
5. **Cache results** when possible to reduce API calls

## Testing Rate Limiting

### Simulate Rate Limit Errors

```bash
# Terminal 1: Start the backend
npm start

# Terminal 2: Test rapid requests
for i in {1..25}; do
  curl -X POST http://localhost:5000/api/chatbot \
    -H "Content-Type: application/json" \
    -d '{"message":"test","userId":"user1"}' \
    -w "\nStatus: %{http_code}\n"
  sleep 0.1  # 100ms delay (faster than throttle)
done
```

Expected output:
- First 20 requests: 200 OK
- Requests 21+: 429 Too Many Requests

## Monitoring

### Check Active Limits

```bash
# View current queue status (in development)
# Add to rate-limiter.js for debugging:
setInterval(() => {
  console.log(`Queue: ${apiQueue.queue.length} pending, ${apiQueue.running} running`);
}, 5000);
```

### Server Logs

Look for these messages:
```
⚠️  Rate limited (429) on compare endpoint
⚠️  GitHub Models rate limited — falling back to Ollama  
Retry 1/2 after 500ms...
```

## Troubleshooting

### "Too Many Requests" (429) Error

**Problem**: User sees rate limit message frequently

**Solution**:
1. Check `SKIP_RATE_LIMIT=false` is NOT set in production
2. Verify rate-limiter uses `req.body?.userId` to track per-user
3. For tests: Increase delays (`await new Promise(r => setTimeout(r, 1000))`)
4. Adjust limits in `rate-limiter.js` if needed

### Exponential Backoff Not Working

**Problem**: Request fails immediately after 1st retry

**Solution**:
1. Verify `retryWithBackoff` is being used (check imports)
2. Check error type: Some errors (401, 403, 404) don't retry
3. Increase max retries if needed:
   ```javascript
   await apiQueue.execute(async () => {
     return await retryWithBackoff(fn, 5);  // 5 retries instead of 3
   });
   ```

### Memory Leak from Queue

**Problem**: Process memory grows over time

**Solution**:
1. Check queue limits are reasonable (max 3 concurrent)
2. Ensure promises resolve/reject properly
3. Monitor with: `console.log(process.memory Usage())`

## Performance Impact

- **Latency**: +200-500ms per request (due to queuing delays)
- **Memory**: ~50KB per request in queue (negligible)
- **CPU**: Minimal (async throttling)
- **Network**: Reduced requests → less bandwidth

## References

- [Express Rate Limit Docs](https://github.com/nfriedly/express-rate-limit)
- [HTTP 429 Status Code](https://tools.ietf.org/html/rfc6585#section-4)
- [Exponential Backoff & Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
