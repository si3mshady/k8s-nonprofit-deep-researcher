# 7-Day Cohort Syllabus: Lovable to Production SaaS (K8s & GitOps)

This syllabus outlines a structured, 7-day intensive program. It teaches students how to export a high-fidelity frontend prototype from **Lovable**, refactor it using **Google Antigravity**, and deploy it as a fully secure, automated, multi-tenant SaaS platform on **Kubernetes** using **Argo CD GitOps**.

---

## 📅 The 7-Day Schedule at a Glance

```mermaid
gantt
    title 7-Day SaaS Engineering Cohort
    dateFormat  X
    axisFormat Day %d
    section Phase 1: The Codebase
    Day 1: Lovable Export & Scaffold   :active, 0, 1
    Day 2: Secure API Routing (BFF)    :active, 1, 2
    Day 3: Database & Auth Isolation   :active, 2, 3
    section Phase 2: Async & Docker
    Day 4: BullMQ Workers & Queues     :active, 3, 4
    Day 5: Docker & Compose Environments:active, 4, 5
    section Phase 3: K8s & GitOps
    Day 6: Helm & Secrets Encryption   :active, 5, 6
    Day 7: GitOps, Ingress, & CI/CD    :active, 6, 7
```

---

### 📅 Day 1: Lovable Export & Project Scaffolding
* **Goal**: Understand the Lovable code export and migrate the React frontend components into a scalable Next.js App Router structure.
* **Topics**:
  * Anatomy of Lovable code bundles (Tailwind config, UI components, client-side mocks).
  * Initializing a Next.js workspace and organizing folder directories.
  * Moving pages and components, and configuring layout hierarchies.
* **Lab**: Export a Lovable template, create a Next.js application, and migrate the UI elements without breaking styles.

---

### 📅 Day 2: Secure API Routing (BFF Pattern)
* **Goal**: Move sensitive keys and AI agent execution loops off the browser using Next.js server-side API Routes.
* **Topics**:
  * Understanding browser security limits (avoiding API key leaks).
  * Designing API endpoints for AI tasks (Tavily search, Ollama/OpenAI prompts).
  * Leveraging Google Antigravity to quickly rewrite client-side requests.
* **Student Guide**: [nextjs-api-route.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day1/nextjs-api-route.md)

---

### 📅 Day 3: Database Schema & Authentication Isolation
* **Goal**: Replace fragile browser `localStorage` with a persistent SQL database and hook up Clerk tenant organization contexts.
* **Topics**:
  * Choosing the right multi-tenant database strategy (shared vs. schema isolation).
  * Defining database schemas with Prisma or Drizzle ORM.
  * Setting up Clerk Organizations and retrieving tenant IDs during API requests.
* **Lab**: Set up a local PostgreSQL instance, create data tables with a mandatory `tenant_id` column, and restrict API endpoint calls to authenticated users.

---

### 📅 Day 4: Asynchronous Queues & Background Workers
* **Goal**: Move long-running AI searches and workflows to a background processor queue to avoid HTTP timeouts.
* **Topics**:
  * Introduction to Redis (in-memory storage) and BullMQ (queue manager).
  * Submitting background jobs and resolving job ticket IDs.
  * Writing independent worker scripts to run tasks asynchronously.
* **Student Guide**: [bullmq-worker.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day2/bullmq-worker.md)

---

### 📅 Day 5: Docker Containerization & Billing Enforcement
* **Goal**: Enforce active Stripe billing boundaries and package the application into optimized container environments.
* **Topics**:
  * Connecting application queues to Stripe Webhooks.
  * Creating a multi-stage production Dockerfile for Next.js.
  * Defining Docker Compose configurations for local multi-tenant testing.
* **Student Guide**: [stripe-quota-limiter.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day2/stripe-quota-limiter.md)

---

### 📅 Day 6: Helm Engineering & Sealed Secrets
* **Goal**: Package the application with Helm and securely encrypt environment variables before pushing them to Git.
* **Topics**:
  * Writing parameterized Helm templates for deployments and services.
  * Setting up the Bitnami Sealed Secrets controller in Kubernetes.
  * Mounting dynamic tenant configurations via ConfigMaps.
* **Student Guides**:
  * Helm Configuration: [helm-values-template.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day3/helm-values-template.md)
  * Secrets Management: [gitops-secrets.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day3/gitops-secrets.md)

---

### 📅 Day 7: GitOps Automation, Cloud Routing, & CI/CD Pipelines
* **Goal**: Set up automated multi-tenant GitOps pipelines in Argo CD, route subdomain traffic via Ingress/Gateway API, and build CI actions.
* **Topics**:
  * Installing and configuring Argo CD and GitOps ApplicationSets.
  * Automating tenant schema creation via Helm Hooks (database migrations).
  * Routing wildcard DNS records using Ingress controllers or the Gateway API.
  * Building a GitHub Actions workflow to build, push, and release updates automatically.
* **Student Guides**:
  * GitOps Directory Generator: [argo-applicationset.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day3/argo-applicationset.md)
  * Ingress & Gateway Routing: [kubernetes-ingress-gateway.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day3/kubernetes-ingress-gateway.md)
  * Database Migrations Hook: [helm-database-migrations.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day3/helm-database-migrations.md)
  * Kubernetes Probes & Logging: [k8s-observability-probes.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day3/k8s-observability-probes.md)
  * CI/CD Actions Workflow: [github-actions-cicd.md](file:///home/si3mshady/grant-explorer-deep-researcher/cohort-templates/day3/github-actions-cicd.md)
