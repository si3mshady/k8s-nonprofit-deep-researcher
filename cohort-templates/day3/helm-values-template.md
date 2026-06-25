# Day 3 Lab Guide: Configuring Multi-Tenant Helm Charts

In this lab, you will configure a standard Helm `values.yaml` file to deploy isolated, tenant-specific variables and mount dynamic runtime configs inside Kubernetes pods.

---

## 🏗️ Multi-Tenant Configuration Architecture
Instead of building a separate Docker image for every single client, we build one production image. We then mount tenant-specific variables at runtime.

* **Tenant ConfigMap**: Mounts to `/app/config.json` inside the pod container.
* **Tenant Ingress**: Maps `tenant-subdomain.domain.com` to the respective pod services.

---

## 🛠️ Task: Define a Tenant's `values.yaml`

Create the configuration file structure inside your Helm folder (e.g. `charts/tenant1/values.yaml`):

```yaml
# 1. Global Deployment Configuration
replicaCount: 1

image:
  repository: myregistry.azurecr.io/grant-explorer-app
  pullPolicy: IfNotPresent
  tag: "v1.0.0"

service:
  type: ClusterIP
  port: 80

# 2. Tenant Routing & Ingress Customizations
# Tells Kubernetes Ingress controllers where to route wildcard traffic
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: tenant1.myplatform.com
      paths:
        - path: /
          pathType: ImplementationSpecific
  tls:
    - secretName: tenant1-tls
      hosts:
        - tenant1.myplatform.com

# 3. Dynamic Tenant Runtime Parameters
# Mounted directly as a ConfigMap to /app/config.json in the container.
tenantConfig:
  TENANT_ID: "tenant1"
  TENANT_NAME: "Hope Foundation"
  TENANT_TOPIC: "Grants supporting youth literacy and libraries"
  OLLAMA_URL: "http://ollama-service.shared-services.svc.cluster.local:11434"
  OLLAMA_MODEL: "qwen2.5:0.5b"
  MAX_TAVILY_RESULTS: 3
  TEST_MODE: "false"

# 4. Sensitive Key Management (Secret Ref)
# Used to populate environment variables securely inside the pod.
tenantSecrets:
  TAVILY_API_KEY: "tvly-production-key-for-tenant1"
```

---

## 🧪 Verification & Testing
Render and dry-run your templates locally using:
```bash
helm install --dry-run --debug tenant1 ./charts/tenant1
```
Ensure that the ConfigMap manifests match your configuration values and that the secrets are properly references.
