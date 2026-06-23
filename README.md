# Multi-Tenant Grant Explorer & Deep Researcher

This repository contains both the React JS application codebase and its GitOps Kubernetes deployment assets (Helm charts and Argo CD ApplicationSets).

---

## Architecture & Multi-Tenancy

The application is built as a **full-stack React application** using Vite and TanStack Start, compiling to a standalone Node.js server. 

To support seamless, secure **multi-tenancy** without rebuilding the Docker image for each tenant, configuration is resolved dynamically at runtime:
1. When a browser loads the application, it requests `/config.json` from the server.
2. The Node server intercepts this request and resolves the configuration using the following precedence:
   - **Filesystem**: Reads a JSON file from `/app/config.json` (or `process.env.RUNTIME_CONFIG_PATH`).
   - **Environment Variables**: If the config file is not found, it dynamically builds the configuration from environment variables (`TENANT_ID`, `TENANT_NAME`, `TENANT_TOPIC`, etc.).
   - **Defaults**: Falls back to built-in development defaults.

This allows deploying the exact same Docker image across different namespaces/tenants in Kubernetes, with each pod serving its own tenant configuration based on mounted ConfigMaps or container env vars.

---

## Local Testing with Docker Compose

You can validate the multi-tenant configuration locally using Docker Compose. We have configured the compose file to use **environment variables** so you can test without mounting files.

1. Build and start the containers:
   ```bash
   docker compose -f deploy/docker-compose.yml up --build
   ```
2. Open <http://localhost:8080> in your browser. Nginx acts as a reverse proxy on port 8080 and directs traffic to the React app container on port 3000.
3. Observe that the dashboard displays the tenant name: **"Hope Foundation (Compose)"** and topic: **"Grants supporting dogs in Texas"** configured in `deploy/docker-compose.yml`.
4. You can edit the environment variables in `deploy/docker-compose.yml` and restart the container to see the changes update instantly:
   ```bash
   docker compose -f deploy/docker-compose.yml up -d
   ```

---

## Kubernetes Deployment (Helm & Argo CD)

### 1. The Helm Chart (`charts/tenant1`)

The chart is configured to deploy the container and mount a dynamic **ConfigMap** containing the tenant's `config.json` file to `/app/config.json`. It also injects the values as environment variables for fallback safety.

To customize a tenant's configuration, edit the `config` section in `charts/<tenant>/values.yaml`:
```yaml
config:
  TENANT_ID: "hope-foundation"
  TENANT_NAME: "Hope Foundation"
  TENANT_TOPIC: "Grants supporting youth literacy"
  SYSTEM_PROMPT: "You are a grant research assistant..."
  TAVILY_API_KEY: "tvly-..."
  OLLAMA_URL: "http://ollama-service:11434"
  OLLAMA_MODEL: "qwen2.5:0.5b"
  MAX_TAVILY_RESULTS: 2
  TEST_MODE: "false"
```

### 2. Multi-Tenant GitOps (`gitops/applictionSet.yaml`)

The Argo CD `ApplicationSet` uses a directory generator to scan the `charts/` folder. For each directory it finds (e.g., `charts/tenant1`, `charts/tenant2`), it automatically generates an Argo CD `Application` pointing to that Helm chart.

To add a new tenant:
1. Create a copy of the `charts/tenant1` directory under a new folder name (e.g., `charts/tenant2`):
   ```bash
   cp -r charts/tenant1 charts/tenant2
   ```
2. Update the values in `charts/tenant2/values.yaml` with the new tenant's configurations.
3. Commit and push the changes. Argo CD will automatically detect the new directory, instantiate the Helm release, create the namespace `tenant2`, generate the ConfigMap, and deploy the application.
