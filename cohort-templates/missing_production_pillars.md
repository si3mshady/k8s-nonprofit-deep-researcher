# Architectural Audit: Gaps to Genuinely "Production-Ready" SaaS

If we were to run this boot camp as a premium, top-tier masterclass, there are 4 critical "Production Pillars" that are currently missing from the curriculum. Without these, students will face major issues when taking their clusters live.

---

## 🔒 Pillar 1: GitOps Secrets Management (No Plaintext Secrets in Git)

### ⚠️ The Gap
In Day 3, students learn to push Helm charts to Git. If they put actual database passwords, Clerk secret keys, or Tavily tokens inside their `values.yaml` or `secret.yaml` files, they are committing plain-text secrets to Git. This is a severe security violation.

### 💡 The Production Solution: Sealed Secrets or External Secrets
You must teach students how to encrypt secrets *before* pushing them to Git.
* **Option A: Bitnami Sealed Secrets**:
  1. Students install the `SealedSecrets` controller in their cluster.
  2. They use a local CLI tool (`kubeseal`) to encrypt their secrets:
     ```bash
     kubeseal --format yaml < secret.yaml > sealedsecret.yaml
     ```
  3. The resulting `sealedsecret.yaml` is safe to commit to Git. Only the controller inside the Kubernetes cluster holds the private key to decrypt it.
* **Option B: External Secrets Operator (ESO)**:
  * Pulls secrets dynamically at runtime from AWS Secrets Manager, HashiCorp Vault, or Doppler.

---

## 🗄️ Pillar 2: Database Provisioning & Schema Isolation

### ⚠️ The Gap
In Day 1, we cover setting up PostgreSQL. But in a multi-tenant namespace model (Day 3), how does each tenant get their database?
* If each tenant spins up a dedicated Postgres pod inside their namespace, the cluster will run out of memory quickly.
* If they share a central PostgreSQL cluster, how does the Helm chart automatically create a new database schema and database user for `tenant2` when Argo CD provisions it?

### 💡 The Production Solution: Helm Hooks & Dynamic DB Provisioning
Teach students how to run **Helm Hooks** to automate schema migration:
1. Use a shared, managed PostgreSQL instance (like AWS RDS or a single highly-available Postgres cluster in the `shared-services` namespace).
2. Configure a Helm `pre-install` or `post-install` **Job** inside the Helm chart.
3. This Job runs a lightweight database runner container (e.g. Prisma Migrate or Drizzle Kit) that connects to the database host, creates the database/schema `tenant_x`, and applies database migrations *before* the application pods start up.

---

## 🔄 Pillar 3: CI/CD Build Pipelines (The Loop Closure)

### ⚠️ The Gap
Argo CD detects changes in Git and deploys them to Kubernetes. But how does the code written in the local editor or Lovable end up in the Docker Registry?

### 💡 The Production Solution: GitHub Actions / GitLab CI
Add a small CI component on Day 2 or Day 3 morning:
1. A GitHub Actions workflow that triggers on every push to the `main` branch.
2. The workflow builds the Next.js Docker image using the multi-stage Dockerfile.
3. It pushes the container image to a registry (Docker Hub, GitHub Packages, or AWS ECR).
4. **Automated Release Tagging**: The pipeline automatically updates the image tag in the GitOps Helm repository, triggering Argo CD to sync the new version.

---

## 📊 Pillar 4: Observability & Centralized Logging

### ⚠️ The Gap
In an isolated multi-tenant namespace environment, finding out *why* a particular tenant's API is returning `500 Internal Server Error` is incredibly tedious if you have to run `kubectl logs` namespace-by-namespace.

### 💡 The Production Solution: Core Observability Stack
Introduce a minimal observability setup:
* **Logging (Loki + Promtail)**: Aggregates logs from all namespaces. Students can filter logs by namespace (e.g., `namespace="tenant1"`) to see what failed in real-time.
* **Health Probes**: Teach students how to configure `livenessProbe` and `readinessProbe` in their Helm chart so Kubernetes automatically restarts crashed Next.js pods.
