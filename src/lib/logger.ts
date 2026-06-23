export type LogLevel = "info" | "success" | "warn" | "error" | "debug";
export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  source: "tavily" | "ollama" | "agent" | "system";
  message: string;
  data?: unknown;
}

type Listener = (entries: LogEntry[]) => void;

class Logger {
  private entries: LogEntry[] = [];
  private listeners = new Set<Listener>();

  log(level: LogLevel, source: LogEntry["source"], message: string, data?: unknown) {
    const e: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      level,
      source,
      message,
      data,
    };
    this.entries = [...this.entries, e].slice(-500);
    // Browser console mirror for full traceability.
    const tag = `[${source.toUpperCase()}]`;
    const fn =
      level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (data !== undefined) fn(tag, message, data);
    else fn(tag, message);
    this.listeners.forEach((l) => l(this.entries));
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.entries);
    return () => this.listeners.delete(l);
  }

  clear() {
    this.entries = [];
    this.listeners.forEach((l) => l(this.entries));
  }
}

export const logger = new Logger();
