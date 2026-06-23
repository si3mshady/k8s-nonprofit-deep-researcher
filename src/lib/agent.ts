// LangGraph JS agent: Tavily search -> Ollama (chat) extraction loop.
// Calls the Ollama-compatible chat endpoint with the payload shape the user's
// proxy expects: { model, messages: [{role, content}, ...], stream: false }.

import { StateGraph, Annotation, START, END, MemorySaver } from "@langchain/langgraph/web";
import { logger } from "./logger";

// In-memory checkpointer: keeps LangGraph state across runs within the session
// so a remount or HMR doesn't lose intermediate agent state.
const checkpointer = new MemorySaver();

export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score?: number;
}

export interface ExtractedGrant {
  name: string;
  summary: string;
  url: string;
  sourceTitle: string;
}

export interface AgentInput {
  topic: string;
  systemPrompt: string;
  tavilyApiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  maxTavilyResults: number;
  ollamaTimeoutMs?: number;
  onProgress?: (status: string) => void;
  onGrant?: (g: ExtractedGrant) => void;
}

const State = Annotation.Root({
  topic: Annotation<string>,
  systemPrompt: Annotation<string>,
  tavilyApiKey: Annotation<string>,
  ollamaUrl: Annotation<string>,
  ollamaModel: Annotation<string>,
  maxTavilyResults: Annotation<number>,
  ollamaTimeoutMs: Annotation<number>,
  tavilyResults: Annotation<TavilyResult[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  currentIndex: Annotation<number>({
    reducer: (_a, b) => b,
    default: () => 0,
  }),
  extractedGrants: Annotation<ExtractedGrant[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  onProgress: Annotation<((s: string) => void) | undefined>,
  onGrant: Annotation<((g: ExtractedGrant) => void) | undefined>,
});

type S = typeof State.State;

async function tavilySearch(state: S): Promise<Partial<S>> {
  state.onProgress?.("Searching Tavily…");
  const body = {
    api_key: state.tavilyApiKey,
    query: state.topic,
    max_results: state.maxTavilyResults,
    search_depth: "basic",
    include_answer: false,
  };
  logger.log("info", "tavily", `POST https://api.tavily.com/search (query="${state.topic}", max_results=${state.maxTavilyResults})`, {
    ...body,
    api_key: body.api_key ? `${body.api_key.slice(0, 6)}…` : "(missing)",
  });
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.log("error", "tavily", `Tavily HTTP ${res.status}`, text);
    throw new Error(`Tavily search failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    results?: TavilyResult[];
    response_time?: number;
    request_id?: string;
  };
  const results = Array.isArray(json.results) ? json.results : [];
  logger.log("success", "tavily", `Tavily returned ${results.length} result(s) in ${json.response_time ?? "?"}s (request_id=${json.request_id ?? "n/a"})`, json);
  return { tavilyResults: results, currentIndex: 0 };
}

async function ollamaExtract(state: S): Promise<Partial<S>> {
  const idx = state.currentIndex;
  const r = state.tavilyResults[idx];
  state.onProgress?.(`Extracting with Ollama (${idx + 1}/${state.tavilyResults.length})…`);

  const userContent = `Tenant mission: ${state.topic}\n\nSource title: ${r.title}\nURL: ${r.url}\nContent:\n${r.content}`;
  const payload = {
    model: state.ollamaModel,
    messages: [
      { role: "system", content: state.systemPrompt },
      { role: "user", content: userContent },
    ],
    stream: false,
  };

  logger.log("info", "ollama", `POST ${state.ollamaUrl} (model=${state.ollamaModel}, result ${idx + 1}/${state.tavilyResults.length})`, {
    url: r.url,
    title: r.title,
    payloadPreview: { ...payload, messages: payload.messages.map((m) => ({ role: m.role, len: m.content.length })) },
  });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), state.ollamaTimeoutMs ?? 600_000);
  let json: unknown;
  try {
    const res = await fetch(state.ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      logger.log("error", "ollama", `Ollama HTTP ${res.status} for "${r.title}"`, text);
      return { currentIndex: idx + 1 };
    }
    json = await res.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.log("error", "ollama", `Ollama request failed for "${r.title}": ${msg}`);
    return { currentIndex: idx + 1 };
  } finally {
    clearTimeout(t);
  }

  // Ollama chat response: { message: { role, content }, ... } or generate-style { response }.
  const j = json as { message?: { content?: string }; response?: string };
  const raw = j.message?.content ?? j.response ?? "";
  logger.log("success", "ollama", `Ollama response for "${r.title}" (${raw.length} chars)`, json);

  const parsed = parseGrant(raw);
  if (parsed && parsed.name && parsed.summary) {
    const grant: ExtractedGrant = {
      name: parsed.name,
      summary: parsed.summary,
      url: r.url,
      sourceTitle: r.title,
    };
    logger.log("success", "agent", `Extracted grant: ${grant.name}`, grant);
    state.onGrant?.(grant);
    return { extractedGrants: [grant], currentIndex: idx + 1 };
  }
  logger.log("warn", "agent", `No grant extracted from "${r.title}"`);
  return { currentIndex: idx + 1 };
}

function parseGrant(raw: string): { name: string | null; summary: string | null } | null {
  if (!raw) return null;
  // Strip code fences and find first {...} block.
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return { name: obj.name ?? null, summary: obj.summary ?? null };
  } catch {
    return null;
  }
}

function routeAfterExtract(state: S): "ollama_extract" | typeof END {
  return state.currentIndex < state.tavilyResults.length ? "ollama_extract" : END;
}

function buildGraph() {
  const g = new StateGraph(State)
    .addNode("tavily_search", tavilySearch)
    .addNode("ollama_extract", ollamaExtract)
    .addEdge(START, "tavily_search")
    .addConditionalEdges("tavily_search", routeAfterExtract, {
      ollama_extract: "ollama_extract",
      [END]: END,
    })
    .addConditionalEdges("ollama_extract", routeAfterExtract, {
      ollama_extract: "ollama_extract",
      [END]: END,
    });
  return g.compile({ checkpointer });
}

// ---------- Deep research / proposal draft ----------

export interface DeepResearchInput {
  grant: ExtractedGrant;
  tenantTopic: string;
  tenantName: string;
  tavilyApiKey: string;
  ollamaUrl: string;
  ollamaModel: string;
  ollamaTimeoutMs?: number;
  onProgress?: (status: string) => void;
}

export interface DeepResearchResult {
  proposal: string;
  sources: TavilyResult[];
}

export async function runDeepResearch(input: DeepResearchInput): Promise<DeepResearchResult> {
  logger.log("info", "agent", `Deep research started for grant: ${input.grant.name}`);
  input.onProgress?.("Researching how to write this kind of grant…");

  // Tavily: research HOW to write a grant proposal/letter for this kind of opportunity.
  const query = `how to write a winning grant proposal letter for ${input.grant.name} — structure, required sections, tone, eligibility`;
  const tavilyBody = {
    api_key: input.tavilyApiKey,
    query,
    max_results: 4,
    search_depth: "advanced",
    include_answer: true,
  };
  logger.log("info", "tavily", `POST https://api.tavily.com/search (deep, query="${query}")`, {
    ...tavilyBody,
    api_key: tavilyBody.api_key ? `${tavilyBody.api_key.slice(0, 6)}…` : "(missing)",
  });
  const tRes = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tavilyBody),
  });
  if (!tRes.ok) {
    const text = await tRes.text();
    logger.log("error", "tavily", `Deep Tavily HTTP ${tRes.status}`, text);
    throw new Error(`Tavily deep search failed: ${tRes.status}`);
  }
  const tJson = (await tRes.json()) as { results?: TavilyResult[]; answer?: string };
  const sources = Array.isArray(tJson.results) ? tJson.results : [];
  logger.log("success", "tavily", `Deep Tavily returned ${sources.length} source(s) for "${input.grant.name}"`, tJson);

  input.onProgress?.("Drafting markdown proposal with Ollama…");
  const guidance = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.content?.slice(0, 600) ?? ""}`)
    .join("\n\n");

  const system = `You are a grant-writing assistant. Your ONLY output is a markdown document — a draft grant proposal letter the organization can edit and send. No preamble, no explanation, no code fences. Start directly with a markdown heading.

Use this structure (markdown headings, bullet lists where helpful):
# {Grant Name} — Draft Proposal Letter
**To:** {Funder}
**From:** {Organization}
**Date:** TBD

## Executive Summary
## Organization & Mission
## Statement of Need
## Proposed Project
## Goals & Measurable Outcomes
## Budget Overview
## Timeline & Milestones
## Organizational Capacity
## Closing & Next Steps

Keep it under ~500 words. Mark unknowns as **TBD**. Use a professional, warm tone suitable for a grant letter. Do NOT include the research notes verbatim — synthesize.`;

  const user = `Organization: ${input.tenantName}
Mission: ${input.tenantTopic}

Target grant: ${input.grant.name}
Grant summary: ${input.grant.summary}
Grant source URL: ${input.grant.url}

Guidance gathered from research on how to write this kind of grant:
${tJson.answer ? `Summary: ${tJson.answer}\n\n` : ""}${guidance}

Now output ONLY the markdown draft proposal letter.`;

  const payload = {
    model: input.ollamaModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  };
  logger.log("info", "ollama", `POST ${input.ollamaUrl} (deep proposal, model=${input.ollamaModel})`, {
    grant: input.grant.name,
    sources: sources.length,
  });

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), input.ollamaTimeoutMs ?? 600_000);
  try {
    const res = await fetch(input.ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      logger.log("error", "ollama", `Ollama proposal HTTP ${res.status}`, text);
      throw new Error(`Ollama proposal draft failed: ${res.status}`);
    }
    const json = (await res.json()) as { message?: { content?: string }; response?: string };
    const proposal = (json.message?.content ?? json.response ?? "").trim();
    logger.log("success", "agent", `Proposal drafted for "${input.grant.name}" (${proposal.length} chars)`);
    return { proposal, sources };
  } finally {
    clearTimeout(t);
  }
}

export async function runResearch(input: AgentInput): Promise<ExtractedGrant[]> {
  logger.log("info", "agent", `Run started: topic="${input.topic}", model=${input.ollamaModel}, max_results=${input.maxTavilyResults}`);
  const graph = buildGraph();
  const final = await graph.invoke(
    {
      topic: input.topic,
      systemPrompt: input.systemPrompt,
      tavilyApiKey: input.tavilyApiKey,
      ollamaUrl: input.ollamaUrl,
      ollamaModel: input.ollamaModel,
      maxTavilyResults: input.maxTavilyResults,
      ollamaTimeoutMs: input.ollamaTimeoutMs ?? 600_000,
      onProgress: input.onProgress,
      onGrant: input.onGrant,
    },
    { recursionLimit: 100, configurable: { thread_id: `discovery-${Date.now()}` } },
  );
  logger.log("success", "agent", `Run complete: ${final.extractedGrants.length} grant(s) extracted from ${final.tavilyResults.length} source(s)`);
  return final.extractedGrants;
}
