// Module-scoped, persisted store for the dashboard.
// - Survives component remounts (HMR, error boundaries, tab switches) because state lives
//   outside React in a module singleton, and is mirrored to localStorage.
// - Long-running work (discovery + deep research) is kicked off from here, NOT from
//   component handlers — that way a remount can't cancel an in-flight run.
// - Deep research is per-grant, fire-and-forget, always available; no blocking of the
//   discovery workflow.

import { runResearch, runDeepResearch, type ExtractedGrant } from "./agent";
import type { TenantConfig } from "./config";
import { logger } from "./logger";

export type RunStatus = "idle" | "running" | "success" | "error";
export type GrantStage = "pending" | "dismissed" | "researching" | "drafted" | "failed";

export interface TrackedGrant extends ExtractedGrant {
  id: string;
  discoveredAt: number;
  stage: GrantStage;
  proposal?: string;
  proposalSources?: { title: string; url: string }[];
  deepError?: string;
  deepStatus?: string;
}

export interface DashboardState {
  grants: TrackedGrant[];
  invocations: number;
  status: RunStatus;
  statusMessage: string;
  error: string | null;
  runStartedAt: number | null;
}

const STORAGE_KEY = "grant_dashboard_state_v1";

const initial: DashboardState = {
  grants: [],
  invocations: 0,
  status: "idle",
  statusMessage: "",
  error: null,
  runStartedAt: null,
};

function loadPersisted(): DashboardState {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<DashboardState>;
    // Heal any in-flight states from a previous session — we can't resume the fetch.
    const grants = (parsed.grants ?? []).map((g) =>
      g.stage === "researching"
        ? { ...g, stage: "pending" as GrantStage, deepStatus: undefined }
        : g,
    );
    return {
      ...initial,
      ...parsed,
      grants,
      status: parsed.status === "running" ? "idle" : (parsed.status ?? "idle"),
      statusMessage: parsed.status === "running" ? "" : (parsed.statusMessage ?? ""),
      runStartedAt: null,
    };
  } catch {
    return initial;
  }
}

class DashboardStore {
  private state: DashboardState = loadPersisted();
  private listeners = new Set<(s: DashboardState) => void>();
  // Track in-flight ops so a remount doesn't spawn duplicates.
  private discoveryInFlight = false;
  private deepInFlight = new Set<string>();

  getState = (): DashboardState => this.state;

  subscribe = (fn: (s: DashboardState) => void) => {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<DashboardState> | ((s: DashboardState) => Partial<DashboardState>)) {
    const p = typeof patch === "function" ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    this.persist();
    this.listeners.forEach((l) => l(this.state));
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* quota — ignore */
    }
  }

  clearAll = () => {
    this.set({ grants: [], error: null });
  };

  reset = () => {
    this.state = { ...initial };
    this.persist();
    this.listeners.forEach((l) => l(this.state));
  };

  dismissGrant = (id: string) => {
    this.set((s) => ({ grants: s.grants.filter((g) => g.id !== id) }));
  };

  // ---- discovery ----
  runDiscovery = async (
    config: TenantConfig,
    opts: { topic?: string; maxResults?: number } = {},
  ) => {
    if (this.discoveryInFlight) {
      logger.log("warn", "agent", "Discovery already in flight; ignoring duplicate trigger");
      return;
    }
    this.discoveryInFlight = true;

    const topic = opts.topic?.trim() || config.TENANT_TOPIC;
    const maxResults = opts.maxResults ?? config.MAX_TAVILY_RESULTS;

    this.set((s) => ({
      status: "running",
      statusMessage: "Initializing agent…",
      error: null,
      runStartedAt: Date.now(),
      invocations: s.invocations + 1,
    }));

    try {
      await runResearch({
        topic,
        systemPrompt: config.SYSTEM_PROMPT,
        tavilyApiKey: config.TAVILY_API_KEY,
        ollamaUrl: config.OLLAMA_URL,
        ollamaModel: config.OLLAMA_MODEL,
        maxTavilyResults: maxResults,
        ollamaTimeoutMs: 600_000,
        onProgress: (m) => this.set({ statusMessage: m }),
        onGrant: (g) =>
          this.set((s) => ({
            grants: [
              ...s.grants,
              {
                ...g,
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                discoveredAt: Date.now(),
                stage: "pending" as GrantStage,
              },
            ],
          })),
      });
      this.set({ status: "success", statusMessage: "Up to date" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.set({ status: "error", statusMessage: "Failed", error: msg });
    } finally {
      this.discoveryInFlight = false;
    }
  };

  // ---- deep research (per grant, always available, non-blocking) ----
  pursueGrant = async (id: string, config: TenantConfig) => {
    if (this.deepInFlight.has(id)) {
      logger.log("warn", "agent", `Deep research already running for grant ${id}`);
      return;
    }
    const target = this.state.grants.find((g) => g.id === id);
    if (!target) return;
    this.deepInFlight.add(id);

    this.set((s) => ({
      grants: s.grants.map((g) =>
        g.id === id
          ? { ...g, stage: "researching", deepStatus: "Starting deep research…", deepError: undefined }
          : g,
      ),
    }));

    try {
      const result = await runDeepResearch({
        grant: target,
        tenantTopic: config.TENANT_TOPIC,
        tenantName: config.TENANT_NAME,
        tavilyApiKey: config.TAVILY_API_KEY,
        ollamaUrl: config.OLLAMA_URL,
        ollamaModel: config.OLLAMA_MODEL,
        onProgress: (s) =>
          this.set((cur) => ({
            grants: cur.grants.map((g) => (g.id === id ? { ...g, deepStatus: s } : g)),
          })),
      });
      this.set((cur) => ({
        grants: cur.grants.map((g) =>
          g.id === id
            ? {
                ...g,
                stage: "drafted",
                proposal: result.proposal,
                proposalSources: result.sources.map((s) => ({ title: s.title, url: s.url })),
                deepStatus: undefined,
              }
            : g,
        ),
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.set((cur) => ({
        grants: cur.grants.map((g) =>
          g.id === id ? { ...g, stage: "failed", deepError: msg, deepStatus: undefined } : g,
        ),
      }));
    } finally {
      this.deepInFlight.delete(id);
    }
  };

  isDiscoveryRunning = () => this.discoveryInFlight;
  isPursuing = (id: string) => this.deepInFlight.has(id);
}

export const dashboardStore = new DashboardStore();
