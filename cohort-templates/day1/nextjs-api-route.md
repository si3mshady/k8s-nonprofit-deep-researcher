# Day 1 Lab Guide: Secure API Routing in Next.js

In this lab, you will refactor the front-end code exported from Lovable. The goal is to move sensitive operations (like API keys and AI generation scripts) to a secure server-side API endpoint in Next.js.

---

## 🔒 The Vulnerability
In a default Lovable export, API keys (e.g., `TAVILY_API_KEY`, `OPENAI_API_KEY`) are often stored in client-side code. This means any user opening their browser DevTools can inspect and steal your credentials, running up bills at your expense.

---

## 🛠️ Task: Implement the BFF (Backend-for-Frontend) API Route

Create a file named `src/app/api/research/route.ts` and paste the following code:

```typescript
import { NextResponse } from 'next/server';
// Example authentication wrapper (e.g., Clerk Auth)
import { auth } from '@clerk/nextjs/server';

/**
 * Secure Backend API Route
 */
export async function POST(req: Request) {
  try {
    // 1. Authenticate user and extract organization (Tenant) context
    const { userId, orgId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Tenant boundary check: Every request must be tied to a validated organization ID
    const tenantId = orgId || 'default-tenant';

    // 2. Parse request payload
    const body = await req.json();
    const { query } = body;

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // 3. Resolve API credentials securely on the server side
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

    if (!TAVILY_API_KEY) {
      console.error(`[TENANT: ${tenantId}] Tavily API key is missing on backend server.`);
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    console.log(`[TENANT: ${tenantId}] Initiating search query for user ${userId}: "${query}"`);

    // 4. Perform the secure server-side operation (e.g., Tavily API search)
    const searchResponse = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        max_results: 3,
      }),
    });

    if (!searchResponse.ok) {
      throw new Error(`Tavily search failed with status ${searchResponse.status}`);
    }

    const searchResults = await searchResponse.json();

    // 5. Return clean results to client (hiding raw provider payloads and headers)
    return NextResponse.json({
      tenantId,
      results: searchResults.results || [],
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
```

---

## 🧪 Verification & Testing
1. Configure your `.env.local` file with:
   ```env
   TAVILY_API_KEY=tvly-your-api-key
   CLERK_SECRET_KEY=your-clerk-secret
   ```
2. Using **Postman** or **cURL**, send a authenticated POST request to `http://localhost:3000/api/research` with body:
   ```json
   {
     "query": "grants for local library research"
   }
   ```
3. Check the developer console logs to verify that the query runs completely server-side and no keys are sent back to the browser network tab.
