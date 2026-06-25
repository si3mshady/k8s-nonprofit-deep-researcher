# Day 2 Lab Guide: Stripe Subscriptions & Quota Enforcement

In this lab, you will write backend helper logic to enforce consumption quotas based on a customer's active Stripe subscription plan before allowing jobs to enter the BullMQ processing queue.

---

## 📈 The Business Logic
In a production AI SaaS, running search queries (Tavily) and inference (OpenAI) costs you money. You must enforce rate limits and job caps based on the customer's subscription tier:
- **Free Tier**: Max 5 research reports per month.
- **Pro Tier**: Max 100 research reports per month.
- **Enterprise**: Unlimited.

---

## 🛠️ Task 1: Create Database Schema for Usage Tracking
Add subscription fields to your Tenant database schema (e.g., in your Prisma/Drizzle schema):

```prisma
model Tenant {
  id                String   @id @default(uuid())
  name              String
  stripeCustomerId  String?  @unique
  stripePriceId     String?  // Identifies active tier (Free, Pro, Enterprise)
  subscriptionStatus String  @default("incomplete")
  usageCount        Int      @default(0)
  usageLimit        Int      @default(5) // Default free quota limit
}
```

---

## 🛠️ Task 2: Create a Quota Verification Middleware
Create a file named `src/lib/quota-limiter.ts` to check limits before submitting tasks:

```typescript
import { db } from './db'; // Your Prisma/Drizzle db client instance

/**
 * Verifies if a tenant has remaining quota capacity.
 * Increments usage if quota remains.
 */
export async function verifyAndIncrementQuota(tenantId: string): Promise<{ allowed: boolean; message?: string }> {
  // 1. Fetch current tenant usage from database
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    return { allowed: false, message: 'Tenant not found.' };
  }

  // 2. Check if subscription status is active/trialing
  const activeStatuses = ['active', 'trialing'];
  const isSubscriptionActive = activeStatuses.includes(tenant.subscriptionStatus);

  if (!isSubscriptionActive && tenant.usageCount >= tenant.usageLimit) {
    return { 
      allowed: false, 
      message: 'Monthly Free quota exceeded. Please upgrade your subscription.' 
    };
  }

  // 3. Check specific price tier limits (Pro vs. Enterprise)
  const PRO_TIER_LIMIT = 100;
  const isEnterprise = tenant.stripePriceId === process.env.STRIPE_ENTERPRISE_PRICE_ID;
  const isPro = tenant.stripePriceId === process.env.STRIPE_PRO_PRICE_ID;

  if (isPro && tenant.usageCount >= PRO_TIER_LIMIT) {
    return { 
      allowed: false, 
      message: 'Monthly Pro quota limit reached (100 reports). Please contact support for Enterprise.' 
    };
  }

  // 4. Increment usage counter
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      usageCount: {
        increment: 1,
      },
    },
  });

  return { allowed: true };
}
```

---

## 🛠️ Task 3: Integrate with API Controller
Update your Day 1 API Route or Day 2 Job Queue endpoint to wrap submissions inside this check:

```typescript
import { verifyAndIncrementQuota } from '@/lib/quota-limiter';
import { submitResearchJob } from '@/lib/queue';

export async function POST(req: Request) {
  const { tenantId, query } = await req.json();

  // Enforce quota limits
  const check = await verifyAndIncrementQuota(tenantId);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 403 });
  }

  // Submit task to queue if quota check is successful
  const jobId = await submitResearchJob(tenantId, query);
  return NextResponse.json({ jobId });
}
```

---

## 🧪 Verification & Testing
1. Mock a tenant in your database with `usageCount = 5` and `usageLimit = 5`.
2. Submit a request to search. Verify the API returns `403 Forbidden` and the task does not enter your Redis queue.
3. Update the tenant record subscription status in your DB to `active` (simulating a Stripe Webhook update) and verify the endpoint successfully processes the request.
