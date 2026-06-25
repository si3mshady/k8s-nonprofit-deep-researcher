# Day 2 Lab Guide: Offloading Heavy Workloads with Queues & Workers

In this lab, you will integrate Redis and BullMQ to prevent HTTP request timeouts during long-running AI searches.

---

## ⏳ The Problem
Long-running AI routines (such as LangGraph search pipelines) take minutes to execute. If client browsers poll or wait on a standard HTTP connection, the request will timeout or fail due to network fluctuations.

---

## 🛠️ Task 1: Initialize Redis via Docker
Run the following command to start a local Redis server instance:
```bash
docker run -d --name saas-redis -p 6379:6379 redis:alpine
```

---

## 🛠️ Task 2: Implement the BullMQ Queue and Worker Setup
Create a file named `src/lib/queue.ts` and write:

```typescript
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

// 1. Establish a connection to Redis
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
});

// 2. Initialize the Task Queue
export const researchQueue = new Queue('ResearchQueue', { connection: redisConnection });

/**
 * Submits a job to the background queue
 */
export async function submitResearchJob(tenantId: string, query: string) {
  const job = await researchQueue.add(
    'deep-research-job',
    { tenantId, query },
    {
      attempts: 3, // Auto-retry 3 times on failure
      backoff: {
        type: 'exponential',
        delay: 5000, // Backoff delays: 5s, 10s...
      },
    }
  );
  return job.id;
}

// 3. Define the Background Worker (processes queued tasks asynchronously)
const researchWorker = new Worker(
  'ResearchQueue',
  async (job: Job) => {
    const { tenantId, query } = job.data;
    console.log(`[Worker] Started processing Job ${job.id} for Tenant ${tenantId}: "${query}"`);

    // Simulated multi-step AI Agent sequence
    await job.updateProgress(10); // 10% Complete
    console.log(`[Worker] Step 1: Performing Tavily Web Search...`);
    await new Promise((r) => setTimeout(r, 2000));

    await job.updateProgress(50); // 50% Complete
    console.log(`[Worker] Step 2: Injecting search context into Ollama / OpenAI...`);
    await new Promise((r) => setTimeout(r, 3000));

    await job.updateProgress(90); // 90% Complete
    console.log(`[Worker] Step 3: Compiling research report draft...`);
    await new Promise((r) => setTimeout(r, 1000));

    await job.updateProgress(100); // 100% Complete
    console.log(`[Worker] Job ${job.id} completed successfully!`);

    return {
      success: true,
      report: `Draft report for "${query}" isolated for tenant ${tenantId}.`,
    };
  },
  { connection: redisConnection }
);

// Worker Events
researchWorker.on('completed', (job) => {
  console.log(`[Worker Event] Job ${job.id} has completed.`);
});

researchWorker.on('failed', (job, err) => {
  console.error(`[Worker Event] Job ${job?.id} failed with error:`, err);
});
```

---

## 🧪 Verification & Testing
1. Call `submitResearchJob('tenant-1', 'Texas solar grants')` inside your API.
2. Confirm the API returns a response containing a JSON payload with the job ID (e.g. `{ "jobId": "1" }`) in less than 50ms.
3. Check your backend terminal logs to see the background worker process the steps and output messages.
