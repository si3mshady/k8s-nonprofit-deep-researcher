import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  FileSearch,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Building2,
  X,
  Check,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadConfigWithSources, saveLocalOverrides, clearLocalOverrides, type TenantConfig, type ConfigSourceMap } from "@/lib/config";
import { logger, type LogEntry } from "@/lib/logger";
import { dashboardStore, type TrackedGrant, type RunStatus } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grant Research Agent — Multi-Tenant Dashboard" },
      { name: "description", content: "Autonomous grant discovery and proposal drafting for mission-driven organizations." },
      { property: "og:title", content: "Grant Research Agent" },
      { property: "og:description", content: "Multi-tenant grant research dashboard." },
    ],
  }),
  component: Dashboard,
  ssr: false,
});

type Status = RunStatus;

function Dashboard() {
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [sources, setSources] = useState<ConfigSourceMap | null>(null);
  const [runtimeLoaded, setRuntimeLoaded] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [overrideTopic, setOverrideTopic] = useState("");
  const [overrideMax, setOverrideMax] = useState<number | "">("");

  // Persisted, module-scoped state — survives remounts.
  const [snapshot, setSnapshot] = useState(() => dashboardStore.getState());
  const grants = snapshot.grants;
  const invocations = snapshot.invocations;
  const status = snapshot.status;
  const statusMessage = snapshot.statusMessage;
  const error = snapshot.error;

  const [elapsed, setElapsed] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const refreshConfig = () =>
    loadConfigWithSources().then(({ config, sources, runtimeLoaded }) => {
      setConfig(config);
      setSources(sources);
      setRuntimeLoaded(runtimeLoaded);
      setTestMode(config.TEST_MODE === "true");
      logger.log(
        runtimeLoaded ? "success" : "warn",
        "system",
        runtimeLoaded
          ? `Runtime /config.json loaded for tenant "${config.TENANT_NAME}" (${config.TENANT_ID})`
          : `No /config.json found — using defaults/env/overrides for tenant "${config.TENANT_NAME}"`,
        { sources },
      );
    });

  useEffect(() => {
    void refreshConfig();
    const unsubLogs = logger.subscribe(setLogs);
    const unsubStore = dashboardStore.subscribe(setSnapshot);
    return () => {
      unsubLogs();
      unsubStore();
    };
  }, []);

  useEffect(() => {
    if (status !== "running" || !snapshot.runStartedAt) return;
    const start = snapshot.runStartedAt;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [status, snapshot.runStartedAt]);

  const updateConfig = (patch: Partial<TenantConfig>) => {
    if (!config) return;
    if (runtimeLoaded) {
      logger.log("warn", "system", "Runtime /config.json is loaded; browser edits are ignored so the mounted config remains authoritative.");
      void refreshConfig();
      return;
    }
    // Note: the runtime /config.json ALWAYS wins on next page load. This local
    // edit is a dev/test override that only persists in this browser until the
    // mounted config changes tenant.
    const next = { ...config, ...patch };
    setConfig(next);
    saveLocalOverrides(patch);
  };

  const resetOverrides = () => {
    clearLocalOverrides();
    void refreshConfig();
  };

  const canRun = useMemo(() => {
    if (!config) return false;
    return Boolean(config.TAVILY_API_KEY && config.OLLAMA_URL && config.OLLAMA_MODEL);
  }, [config]);

  const execute = () => {
    if (!config) return;
    void dashboardStore.runDiscovery(config, {
      topic: testMode ? overrideTopic : undefined,
      maxResults: testMode && overrideMax !== "" ? Number(overrideMax) : undefined,
    });
  };

  const dismissGrant = (id: string) => dashboardStore.dismissGrant(id);

  const pursueGrant = (id: string) => {
    if (!config) return;
    void dashboardStore.pursueGrant(id, config);
  };

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const active = grants.filter((g) => g.stage !== "dismissed");
  const pendingCount = active.filter((g) => g.stage === "pending").length;
  const draftedCount = active.filter((g) => g.stage === "drafted").length;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur-md bg-background/60 sticky top-0 z-20">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">Grant Research Agent</h1>
              <p className="text-xs text-muted-foreground">Multi-tenant · LangGraph · Tavily · Ollama</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CompactStatus status={status} message={statusMessage} elapsed={elapsed} />
            <button
              onClick={execute}
              disabled={!canRun || status === "running"}
              title={canRun ? "Run the agent now" : "Configure credentials first"}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-foreground ring-1 ring-border hover:ring-primary/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Run now
            </button>
            <button
              onClick={() => setTestMode((v) => !v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ring-1 transition ${
                testMode
                  ? "bg-warning/15 text-warning ring-warning/40"
                  : "bg-muted text-muted-foreground ring-border hover:ring-primary/40"
              }`}
            >
              Test: {testMode ? "ON" : "OFF"}
            </button>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-foreground ring-1 ring-border hover:ring-primary/40 flex items-center gap-1.5"
            >
              <Settings2 className="h-3.5 w-3.5" /> Configuration
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* Tenant card + KPIs */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl bg-card ring-1 ring-border p-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 ring-1 ring-primary/30 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight truncate">{config.TENANT_NAME}</h2>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground ring-1 ring-border">
                    {config.TENANT_ID}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  <span className="text-foreground/70 font-medium">Mission: </span>
                  {config.TENANT_TOPIC}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Pending review" value={pendingCount} icon={<FileSearch className="h-4 w-4" />} accent />
            <KpiCard label="Drafts" value={draftedCount} icon={<FileText className="h-4 w-4" />} />
            <KpiCard label="Runs" value={invocations} icon={<Activity className="h-4 w-4" />} />
          </div>
        </section>

        {/* Test-mode overrides */}
        {testMode && (
          <section className="rounded-xl bg-card/60 ring-1 ring-dashed ring-warning/40 p-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
              <Field
                label="Override topic (optional)"
                value={overrideTopic}
                onChange={setOverrideTopic}
                placeholder={config.TENANT_TOPIC}
              />
              <Field
                label="Override max results"
                value={overrideMax === "" ? "" : String(overrideMax)}
                onChange={(v) => setOverrideMax(v === "" ? "" : Math.max(1, Number(v) || 1))}
                type="number"
                placeholder={String(config.MAX_TAVILY_RESULTS)}
              />
            </div>
          </section>
        )}

        {/* Settings panel */}
        {showSettings && (
          <section className="rounded-xl bg-card ring-1 ring-border p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">Runtime Configuration</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The mounted <code className="text-primary">/config.json</code> is authoritative. When Docker Compose is running, these fields are read from <code className="text-primary">deploy/config.runtime.json</code> only.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                  <span
                    className={`px-1.5 py-0.5 rounded ring-1 ${
                      runtimeLoaded
                        ? "bg-success/15 text-success ring-success/40"
                        : "bg-warning/15 text-warning ring-warning/40"
                    }`}
                  >
                    /config.json: {runtimeLoaded ? "loaded" : "missing"}
                  </span>
                  <span className="text-muted-foreground">
                    Legend: <span className="text-success">runtime</span> · <span className="text-primary">env</span> · <span className="text-warning">override</span> · <span className="text-muted-foreground">default</span>
                  </span>
                </div>
              </div>
              <button onClick={resetOverrides} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 shrink-0">
                <Trash2 className="h-3 w-3" /> Reset local overrides
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Tenant Name" value={config.TENANT_NAME} onChange={(v) => updateConfig({ TENANT_NAME: v })} source={sources?.TENANT_NAME} readOnly={runtimeLoaded} />
              <Field label="Tenant ID" value={config.TENANT_ID} onChange={(v) => updateConfig({ TENANT_ID: v })} source={sources?.TENANT_ID} readOnly={runtimeLoaded} />
              <Field
                label="Tenant Topic / Mission"
                value={config.TENANT_TOPIC}
                onChange={(v) => updateConfig({ TENANT_TOPIC: v })}
                textarea
                className="md:col-span-2"
                source={sources?.TENANT_TOPIC}
                readOnly={runtimeLoaded}
              />
              <Field
                label="System Prompt"
                value={config.SYSTEM_PROMPT}
                onChange={(v) => updateConfig({ SYSTEM_PROMPT: v })}
                textarea
                className="md:col-span-2"
                source={sources?.SYSTEM_PROMPT}
                readOnly={runtimeLoaded}
              />
              <Field
                label="Tavily API Key"
                value={config.TAVILY_API_KEY}
                onChange={(v) => updateConfig({ TAVILY_API_KEY: v })}
                type="password"
                placeholder="tvly-…"
                source={sources?.TAVILY_API_KEY}
                readOnly={runtimeLoaded}
              />
              <Field
                label="Max Tavily Results"
                value={String(config.MAX_TAVILY_RESULTS)}
                onChange={(v) => updateConfig({ MAX_TAVILY_RESULTS: Math.max(1, Number(v) || 1) })}
                type="number"
                source={sources?.MAX_TAVILY_RESULTS}
                readOnly={runtimeLoaded}
              />
              <Field
                label="Ollama Chat URL (full endpoint)"
                value={config.OLLAMA_URL}
                onChange={(v) => updateConfig({ OLLAMA_URL: v })}
                placeholder="https://your-proxy.example.com/api/chat"
                className="md:col-span-2"
                help='Must accept POST with { model, messages: [{role,content}], stream: false }'
                source={sources?.OLLAMA_URL}
                readOnly={runtimeLoaded}
              />
              <Field
                label="Ollama Model"
                value={config.OLLAMA_MODEL}
                onChange={(v) => updateConfig({ OLLAMA_MODEL: v })}
                placeholder="qwen2.5:0.5b"
                source={sources?.OLLAMA_MODEL}
                readOnly={runtimeLoaded}
              />
            </div>
          </section>
        )}

        {/* PRIMARY: Discover Grants */}
        <section>
          <div className="flex items-end justify-between mb-4 gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Discover Grants</h2>
              <p className="text-sm text-muted-foreground mt-1">
                The agent continuously surfaces opportunities aligned to your mission. Approve the ones worth pursuing — a draft proposal will be generated for each.
              </p>
            </div>
            {active.length > 0 && (
              <button
                onClick={() => dashboardStore.clearAll()}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 shrink-0"
              >
                <Trash2 className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>

          {!canRun && (
            <div className="mb-4 rounded-lg bg-warning/10 ring-1 ring-warning/30 px-4 py-3 text-xs text-warning flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Configure Tavily API key, Ollama URL, and model in <strong>Configuration</strong> to start discovery.
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 ring-1 ring-destructive/30 px-4 py-3 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          {active.length === 0 ? (
            <div className="rounded-xl bg-card/50 ring-1 ring-dashed ring-border p-12 text-center">
              <FileSearch className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {status === "running"
                  ? "Agent is searching for opportunities…"
                  : "No grants surfaced yet. The agent will append new results as they're discovered."}
              </p>
              {canRun && status !== "running" && (
                <button
                  onClick={execute}
                  className="mt-4 inline-flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <Play className="h-3.5 w-3.5" /> Trigger a discovery run now
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {active.map((g) => (
                <GrantCard key={g.id} grant={g} onPursue={pursueGrant} onDismiss={dismissGrant} />
              ))}
            </div>
          )}
        </section>

        {/* Activity Log — de-emphasized */}
        <section className="rounded-lg bg-card/40 ring-1 ring-border/60 overflow-hidden">
          <button
            onClick={() => setShowLogs((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-accent/30 transition text-xs"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              <span>Activity log</span>
              <span className="opacity-60">({logs.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {showLogs && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    logger.clear();
                  }}
                  role="button"
                  className="text-muted-foreground hover:text-destructive flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </span>
              )}
              {showLogs ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          </button>
          {showLogs && (
            <div className="max-h-80 overflow-auto border-t border-border/40 font-mono text-[11px]">
              {logs.length === 0 ? (
                <p className="p-4 text-muted-foreground">No activity yet.</p>
              ) : (
                <ul>
                  {logs
                    .slice()
                    .reverse()
                    .map((e) => (
                      <li key={e.id} className="px-4 py-1.5 border-b border-border/30 flex items-start gap-3">
                        <span className="text-muted-foreground/60 shrink-0 w-20">
                          {new Date(e.ts).toLocaleTimeString()}
                        </span>
                        <span
                          className={`shrink-0 w-14 uppercase text-[10px] font-bold ${
                            e.level === "error"
                              ? "text-destructive"
                              : e.level === "warn"
                                ? "text-warning"
                                : e.level === "success"
                                  ? "text-success"
                                  : "text-primary"
                          }`}
                        >
                          {e.source}
                        </span>
                        <span className="text-foreground/80 break-all">{e.message}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <footer className="text-center text-xs text-muted-foreground pt-2 pb-8">
          MVP · in-memory results · runtime config via <code className="text-primary">/config.json</code> or VITE_* env
        </footer>
      </main>
    </div>
  );
}

function GrantCard({
  grant,
  onPursue,
  onDismiss,
}: {
  grant: TrackedGrant;
  onPursue: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [draftOpen, setDraftOpen] = useState(false);

  const stageBadge = {
    pending: { label: "Awaiting decision", cls: "bg-primary/15 text-primary ring-primary/30" },
    researching: { label: "Deep research…", cls: "bg-primary/15 text-primary ring-primary/30" },
    drafted: { label: "Draft ready", cls: "bg-success/15 text-success ring-success/30" },
    failed: { label: "Failed", cls: "bg-destructive/15 text-destructive ring-destructive/30" },
    dismissed: { label: "Dismissed", cls: "bg-muted text-muted-foreground ring-border" },
  }[grant.stage];

  return (
    <article
      className={`rounded-xl bg-card ring-1 p-5 transition ${
        grant.stage === "drafted" ? "ring-success/30" : "ring-border hover:ring-primary/40"
      } ${grant.stage === "dismissed" ? "opacity-0" : "opacity-100"}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${stageBadge.cls}`}>
              {stageBadge.label}
            </span>
          </div>
          <h4 className="font-semibold leading-snug">{grant.name}</h4>
        </div>
        <a
          href={grant.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-primary"
          aria-label="Open source"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{grant.summary}</p>
      <p className="mt-2 text-[11px] text-muted-foreground/70 truncate">Source: {grant.sourceTitle}</p>

      {/* Approval CTA */}
      {grant.stage === "pending" && (
        <div className="mt-4 rounded-lg bg-primary/5 ring-1 ring-primary/20 p-3">
          <p className="text-xs text-foreground/90 font-medium mb-2.5">
            Pursue this grant and generate a draft proposal?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPursue(grant.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110"
            >
              <Check className="h-3.5 w-3.5" /> Yes, pursue
            </button>
            <button
              onClick={() => onDismiss(grant.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-foreground text-xs font-medium ring-1 ring-border hover:ring-destructive/40 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" /> No, dismiss
            </button>
          </div>
        </div>
      )}

      {grant.stage === "researching" && (
        <div className="mt-4 rounded-lg bg-primary/5 ring-1 ring-primary/20 p-3 flex items-center gap-2 text-xs text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {grant.deepStatus ?? "Running deep research…"}
        </div>
      )}

      {grant.stage === "failed" && (
        <div className="mt-4 rounded-lg bg-destructive/10 ring-1 ring-destructive/30 p-3 text-xs text-destructive">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-medium flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Deep research failed
            </span>
            <button
              onClick={() => onPursue(grant.id)}
              className="text-[11px] underline hover:opacity-80"
            >
              Retry
            </button>
          </div>
          <p className="opacity-90">{grant.deepError}</p>
        </div>
      )}

      {grant.stage === "drafted" && grant.proposal && (
        <>
          <div className="mt-4 rounded-lg bg-success/5 ring-1 ring-success/30 px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <FileText className="h-3.5 w-3.5" /> Draft proposal ready
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setDraftOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success text-success-foreground text-[11px] font-semibold hover:brightness-110"
              >
                <Eye className="h-3 w-3" /> View
              </button>
              <button
                onClick={() => onDismiss(grant.id)}
                className="text-[11px] text-muted-foreground hover:text-destructive inline-flex items-center gap-1 px-1.5"
                aria-label="Remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-sm font-medium text-muted-foreground">
                  Draft proposal · <span className="text-foreground">{grant.name}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto pr-2 -mr-2">
                <article className="prose prose-sm prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0">
                  <ReactMarkdown>{grant.proposal}</ReactMarkdown>
                </article>
                {grant.proposalSources && grant.proposalSources.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-border/40">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      Research sources
                    </p>
                    <ul className="space-y-1">
                      {grant.proposalSources.map((s, i) => (
                        <li key={i} className="text-[11px] truncate">
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {s.title || s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border/40">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(grant.proposal ?? "");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Copy markdown
                </button>
                <button
                  onClick={() => setDraftOpen(false)}
                  className="px-3 py-1.5 rounded-md bg-muted text-foreground text-xs font-medium ring-1 ring-border hover:ring-primary/40"
                >
                  Close
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </article>
  );
}

function KpiCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-xl bg-card ring-1 ring-border p-4 ${accent ? "ring-primary/30" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={accent ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function CompactStatus({ status, message, elapsed }: { status: Status; message: string; elapsed: number }) {
  const cfg = {
    idle: { Icon: Activity, cls: "text-muted-foreground" },
    running: { Icon: Loader2, cls: "text-primary", spin: true },
    success: { Icon: CheckCircle2, cls: "text-success" },
    error: { Icon: AlertCircle, cls: "text-destructive" },
  }[status];
  const Icon = cfg.Icon;
  return (
    <div className={`hidden md:inline-flex items-center gap-1.5 text-xs ${cfg.cls}`}>
      <Icon className={`h-3.5 w-3.5 ${"spin" in cfg && cfg.spin ? "animate-spin" : ""}`} />
      <span className="font-medium">{message || (status === "idle" ? "Idle" : status)}</span>
      {status === "running" && <span className="tabular-nums opacity-70">· {elapsed}s</span>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  textarea,
  className,
  help,
  source,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  textarea?: boolean;
  className?: string;
  help?: string;
  source?: "runtime" | "env" | "override" | "default";
  readOnly?: boolean;
}) {
  const srcTone =
    source === "runtime"
      ? "bg-success/15 text-success ring-success/40"
      : source === "env"
        ? "bg-primary/15 text-primary ring-primary/40"
        : source === "override"
          ? "bg-warning/15 text-warning ring-warning/40"
          : "bg-muted text-muted-foreground ring-border";
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
        {source && (
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${srcTone}`}>
            {source}
          </span>
        )}
      </span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          rows={3}
          className="mt-1.5 w-full rounded-md bg-input/60 ring-1 ring-border focus:ring-primary/60 focus:outline-none px-3 py-2 text-sm font-mono read-only:cursor-default read-only:opacity-80"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          className="mt-1.5 w-full rounded-md bg-input/60 ring-1 ring-border focus:ring-primary/60 focus:outline-none px-3 py-2 text-sm read-only:cursor-default read-only:opacity-80"
        />
      )}
      {help && <span className="block mt-1 text-[11px] text-muted-foreground/80">{help}</span>}
    </label>
  );
}
