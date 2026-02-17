// API Controller - Testing & Examples
// Copy and paste these commands in browser console to test the API Controller

// =============================================================================
// 1. Check if APIController is loaded
// =============================================================================
console.log('APIController loaded:', typeof APIController !== 'undefined');
console.log('APIController methods:', APIController);

// =============================================================================
// 2. Test logging system
// =============================================================================
APIController.log('Testing logging system', 'info');
APIController.log('This is a success message', 'success');
APIController.log('This is a warning', 'warning');
APIController.log('This is an error', 'error');

// =============================================================================
// 3. Manually build and send a critic review (without form)
// =============================================================================
const testCriticPayload = {
  type: 'critic',
  album: 'Test Album',
  artist: 'Test Artist',
  score: 8.5,
  review: 'This is a test review from console',
  author: 'Console Tester',
  imageData: null,
  timestamp: new Date().toISOString()
};

APIController.enqueue(testCriticPayload, 'critic');

// =============================================================================
// 4. Test queue with multiple items
// =============================================================================
const testNewsPayload = {
  type: 'news',
  category: 'Test',
  headline: 'Test Headline',
  subtitle: 'Test Subtitle',
  content: 'Test content from console',
  quote: 'Test quote',
  author: 'Console Tester',
  imageData: null,
  timestamp: new Date().toISOString()
};

APIController.enqueue(testCriticPayload, 'critic');
APIController.enqueue(testNewsPayload, 'news');

// =============================================================================
// 5. Check queue status
// =============================================================================
console.log('Queue size:', APIController.requestQueue.length);
console.log('Is processing:', APIController.isProcessing);

// =============================================================================
// 6. Change API endpoint for testing
// =============================================================================
// Use a mock API service like JSONPlaceholder or httpbin.org
APIController.endpoint = 'https://httpbin.org/post';
console.log('API endpoint changed to:', APIController.endpoint);

// =============================================================================
// 7. Test with a real mock API
// =============================================================================
// This will actually send the request and you can see the response
const mockPayload = {
  type: 'test',
  message: 'Testing from browser console',
  timestamp: new Date().toISOString()
};

APIController.enqueue(mockPayload, 'test');

// =============================================================================
// 8. Simulate rate limit error (for testing retry logic)
// =============================================================================
// You would need to modify the endpoint to return 429 status
// Or use a service like: https://httpstat.us/429

APIController.endpoint = 'https://httpstat.us/429';
APIController.enqueue({ test: 'retry test' }, 'test');
// Watch console to see retry attempts

// Reset endpoint after test
setTimeout(() => {
  APIController.endpoint = 'https://httpbin.org/post';
}, 10000);

// =============================================================================
// 9. Monitor network requests
// =============================================================================
console.log(`
To monitor API requests:
1. Open DevTools (F12)
2. Go to Network tab
3. Filter by Fetch/XHR
4. Publish content from admin panel
5. Watch requests in real-time
`);

// =============================================================================
// 10. Verify payload structure
// =============================================================================
console.log('Critic payload example:', APIController.buildCriticPayload());
console.log('News payload example:', APIController.buildNewsPayload());
console.log('Interview payload example:', APIController.buildInterviewPayload());
console.log('Chart payload example:', APIController.buildChartPayload());

// =============================================================================
// TIPS
// =============================================================================
console.log(`
API Controller Tips:
• All form submissions automatically trigger API calls
• Check console for detailed logs
• Queue processes at 120ms intervals
• Failed requests retry up to 3 times
• Rate limit errors (429) trigger automatic retry
• Change endpoint at runtime: APIController.endpoint = 'YOUR_URL'
• Monitor queue: APIController.requestQueue
• Check if processing: APIController.isProcessing
`);
