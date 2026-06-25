import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Day 2: Redis + BullMQ Asynchronous Task Queue Template
 * 
 * Demonstrates:
 * 1. Connecting securely to a Redis server.
 * 2. Creating a Queue to submit heavy jobs (e.g. AI Deep Research runs).
 * 3. Writing a Worker process that runs asynchronously in the background.
 */

// 1. Establish a connection to Redis
const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
});

// 2. Initialize the Task Queue
export const researchQueue = new Queue('ResearchQueue', { connection: redisConnection });

/**
 * Function to submit a job to the background queue
 */
export async function submitResearchJob(tenantId: string, query: string) {
  const job = await researchQueue.add(
    'deep-research-job',
    { tenantId, query },
    {
      attempts: 3, // Automatically retry 3 times if the task fails
      backoff: {
        type: 'exponential',
        delay: 5000, // Wait 5s, then 10s, etc.
      },
    }
  );
  return job.id;
}

// 3. Define the Background Worker (processes tickets from the Redis Queue)
const researchWorker = new Worker(
  'ResearchQueue',
  async (job: Job) => {
    const { tenantId, query } = job.data;
    console.log(`[Worker] Started processing Job ${job.id} for Tenant ${tenantId}: "${query}"`);

    // Simulate multi-step AI Agent sequence
    await job.updateProgress(10); // 10%
    console.log(`[Worker] Step 1: Performing Tavily Web Search...`);
    // Simulated delay
    await new Promise((r) => setTimeout(r, 2000));

    await job.updateProgress(50); // 50%
    console.log(`[Worker] Step 2: Injecting search context into Ollama / OpenAI...`);
    await new Promise((r) => setTimeout(r, 3000));

    await job.updateProgress(90); // 90%
    console.log(`[Worker] Step 3: Compiling research report draft...`);
    await new Promise((r) => setTimeout(r, 1000));

    await job.updateProgress(100); // 100%
    console.log(`[Worker] Job ${job.id} completed successfully!`);

    return {
      success: true,
      report: `Draft report for "${query}" isolated for tenant ${tenantId}.`,
    };
  },
  { connection: redisConnection }
);

// Worker Event Listeners
researchWorker.on('completed', (job) => {
  console.log(`[Worker Event] Job ${job.id} has completed.`);
});

researchWorker.on('failed', (job, err) => {
  console.error(`[Worker Event] Job ${job?.id} failed with error:`, err);
});
