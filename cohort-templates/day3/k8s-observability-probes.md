# Day 3 Lab Guide: Kubernetes Health Probes & Centralized Logging

In this lab, you will configure Kubernetes **Liveness & Readiness Probes** to make your SaaS self-healing, and explore how to collect tenant logs across multiple namespaces.

---

## 🏥 Self-Healing Architecture
* **Liveness Probe**: Determines if the application container needs a restart (e.g., if the Next.js process freezes or deadlocks).
* **Readiness Probe**: Determines if the container is ready to accept incoming user traffic. If it fails, Kubernetes stops sending users to this pod (e.g., while the database migration job is still running).

---

## 🛠️ Task 1: Add Liveness & Readiness Probes to Helm

Update `charts/tenant-app/templates/deployment.yaml` inside the container spec:

```yaml
spec:
  containers:
    - name: app-container
      image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
      ports:
        - containerPort: 3000
          name: http
      
      # 1. Readiness Probe: Checks if the app is ready for traffic
      readinessProbe:
        httpGet:
          path: /api/health
          port: http
        initialDelaySeconds: 10 # Wait 10 seconds before starting checks
        periodSeconds: 5        # Check every 5 seconds
        failureThreshold: 2     # Allow 2 failures before removal
      
      # 2. Liveness Probe: Checks if the container has crashed
      livenessProbe:
        httpGet:
          path: /api/health
          port: http
        initialDelaySeconds: 15 # Wait 15 seconds before starting checks
        periodSeconds: 10       # Check every 10 seconds
        failureThreshold: 3     # Allow 3 failures before restarting pod
```

---

## 🛠️ Task 2: Implement the `/api/health` Endpoint in Next.js

Create a file named `src/app/api/health/route.ts` to respond to the probes:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db'; // Your Prisma/Drizzle connection

export async function GET() {
  try {
    // Check database connection responsiveness
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Liveness/Readiness probe failed:', error);
    return NextResponse.json({ 
      status: 'unhealthy', 
      error: 'Database connection failed' 
    }, { status: 500 });
  }
}
```

---

## 🛠️ Task 3: Centralized Multi-Tenant Logging (Loki Concept)
To monitor logs across multiple tenant namespaces:
1. **Locally**: Run `kubectl logs` with label selectors:
   ```bash
   kubectl logs -l app=grant-explorer --all-namespaces --tail=100 -f
   ```
2. **Production**: Deploy Grafana Loki and Promtail. This automatically scrapes stdout/stderr logs from all pods, appending the namespace name as a searchable tag:
   ```text
   {namespace="tenant1"}  --> Fetches only logs from the Hope Foundation instance.
   {namespace="tenant2"}  --> Fetches only logs from the Texas Solar instance.
   ```

---

## 🧪 Verification & Testing
1. Deploy the update. Kill your PostgreSQL instance or change the DB password env variable.
2. Run `kubectl get pods -n tenant1`.
3. Observe the `Ready` status change to `0/1` because the database connection fails and the Readiness probe returns 500.
4. Verify that users requesting the site get a `503 Service Unavailable` instead of seeing raw, broken stack trace pages.
