// Runtime configuration loader.
//
// Precedence:
//   - If /config.json exists: DEFAULTS -> /config.json only.
//   - If /config.json is missing: DEFAULTS -> VITE_* env -> localStorage overrides.
//
// Rule: the externally mounted /config.json ALWAYS wins. This is what makes the
// app multi-tenant: ops drops a new config.json (via Docker volume / K8s
// ConfigMap) and the running container picks it up — no rebuild, no code change,
// no stale browser localStorage or build-time env masking it.
//
// We also fingerprint the runtime config by TENANT_ID. If the mounted tenant
// changes, any stale localStorage overrides from a previous tenant are wiped
// automatically so they can never bleed across tenants.

export interface TenantConfig {
  TENANT_ID: string;
  TENANT_NAME: string;
  TENANT_TOPIC: string;
  SYSTEM_PROMPT: string;
  TAVILY_API_KEY: string;
  OLLAMA_URL: string;
  OLLAMA_MODEL: string;
  MAX_TAVILY_RESULTS: number;
  TEST_MODE: string;
}

export type ConfigSource = "runtime" | "env" | "override" | "default";
export type ConfigSourceMap = Record<keyof TenantConfig, ConfigSource>;

export interface LoadedConfig {
  config: TenantConfig;
  sources: ConfigSourceMap;
  runtimeLoaded: boolean;
  runtimeTenantId: string | null;
}

const DEFAULTS: TenantConfig = {
  TENANT_ID: "demo-001",
  TENANT_NAME: "Demo Non-Profit",
  TENANT_TOPIC: "Grants for community programs",
  SYSTEM_PROMPT:
    'You are a grant research assistant. Extract one grant from the source. Respond strict JSON: {"name":"...","summary":"... (<=30 words)"}. If none, {"name":null,"summary":null}.',
  TAVILY_API_KEY: "",
  OLLAMA_URL: "",
  OLLAMA_MODEL: "qwen2.5:0.5b",
  MAX_TAVILY_RESULTS: 2,
  TEST_MODE: "false",
};

const LS_KEY = "tenant_config_override_v1";
const LS_TENANT_FINGERPRINT = "tenant_config_fingerprint_v1";

function coerce<K extends keyof TenantConfig>(key: K, value: unknown): TenantConfig[K] | undefined {
  if (value === undefined || value === null) return undefined;
  if (key === "MAX_TAVILY_RESULTS") {
    const n = Number(value);
    return (Number.isFinite(n) ? n : undefined) as TenantConfig[K] | undefined;
  }
  return String(value) as TenantConfig[K];
}

function readEnv(): Partial<TenantConfig> {
  const e = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const out: Partial<TenantConfig> = {};
  for (const k of Object.keys(DEFAULTS) as (keyof TenantConfig)[]) {
    const v = coerce(k, e[`VITE_${k}`]);
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

async function readRuntimeJson(): Promise<Partial<TenantConfig> | null> {
  if (typeof window === "undefined") return null;
  try {
    // cache: no-store so a ConfigMap/volume edit + container restart is picked up
    // immediately on next page load, without any browser caching in between.
    const res = await fetch(`/config.json?runtime=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const out: Partial<TenantConfig> = {};
    for (const k of Object.keys(DEFAULTS) as (keyof TenantConfig)[]) {
      const v = coerce(k, json[k]);
      if (v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

function readLocalOverrides(): Partial<TenantConfig> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Partial<TenantConfig>) : {};
  } catch {
    return {};
  }
}

export function saveLocalOverrides(patch: Partial<TenantConfig>) {
  if (typeof window === "undefined") return;
  const existing = readLocalOverrides();
  const merged = { ...existing, ...patch };
  window.localStorage.setItem(LS_KEY, JSON.stringify(merged));
}

export function clearLocalOverrides() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LS_KEY);
}

function purgeOverridesIfTenantChanged(runtimeTenantId: string | null) {
  if (typeof window === "undefined" || !runtimeTenantId) return;
  const prev = window.localStorage.getItem(LS_TENANT_FINGERPRINT);
  if (prev !== runtimeTenantId) {
    window.localStorage.removeItem(LS_KEY);
    window.localStorage.setItem(LS_TENANT_FINGERPRINT, runtimeTenantId);
  }
}

export async function loadConfigWithSources(): Promise<LoadedConfig> {
  const runtime = await readRuntimeJson();
  const runtimeTenantId = (runtime?.TENANT_ID as string | undefined) ?? null;

  // If ops switched the mounted tenant, drop stale browser overrides BEFORE
  // we merge them in. This is what guarantees tenant isolation in the browser.
  purgeOverridesIfTenantChanged(runtimeTenantId);

  const env = runtime === null ? readEnv() : {};
  const overrides = runtime === null ? readLocalOverrides() : {};

  // Build the merged config AND track which source supplied each key, so the
  // UI can show ops where every value actually came from.
  const config = { ...DEFAULTS } as TenantConfig;
  const sources = {} as ConfigSourceMap;
  for (const k of Object.keys(DEFAULTS) as (keyof TenantConfig)[]) {
    sources[k] = "default";
  }

  const apply = (patch: Partial<TenantConfig> | undefined | null, src: ConfigSource) => {
    if (!patch) return;
    for (const k of Object.keys(patch) as (keyof TenantConfig)[]) {
      const v = patch[k];
      if (v === undefined || v === null) continue;
      (config as unknown as Record<string, unknown>)[k] = v;
      sources[k] = src;
    }
  };

  // Order matters — later overrides earlier.
  apply(env, "env");
  apply(overrides, "override");
  apply(runtime ?? undefined, "runtime"); // AUTHORITATIVE — wins over local overrides.

  return {
    config,
    sources,
    runtimeLoaded: runtime !== null,
    runtimeTenantId,
  };
}

// Back-compat thin wrapper: existing callers that just want the merged config.
export async function loadConfig(): Promise<TenantConfig> {
  const { config } = await loadConfigWithSources();
  return config;
}
