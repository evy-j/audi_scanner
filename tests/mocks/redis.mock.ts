type StoredValue = string | Map<string, string> | Set<string> | string[];

export class InMemoryRedisMock {
  private readonly store = new Map<string, StoredValue>();
  private readonly expirations = new Map<string, number>();

  async get(key: string): Promise<string | null> {
    this.expireIfNeeded(key);
    const value = this.store.get(key);
    return typeof value === "string" ? value : null;
  }

  async set(key: string, value: string): Promise<"OK"> {
    this.store.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        deleted += 1;
      }
      this.expirations.delete(key);
    }
    return deleted;
  }

  async incr(key: string): Promise<number> {
    const current = Number((await this.get(key)) ?? 0) + 1;
    this.store.set(key, current.toString());
    return current;
  }

  async hset(key: string, values: Record<string, string | number>): Promise<number> {
    const hash = this.getHash(key);
    let changed = 0;
    for (const [field, value] of Object.entries(values)) {
      if (!hash.has(field)) {
        changed += 1;
      }
      hash.set(field, String(value));
    }
    return changed;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.getHash(key));
  }

  async rpush(key: string, value: string): Promise<number> {
    const list = this.getList(key);
    list.push(value);
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    const list = this.getList(key);
    const normalizedStart = start < 0 ? Math.max(0, list.length + start) : start;
    const normalizedStop = stop < 0 ? list.length + stop : stop;
    this.store.set(key, list.slice(normalizedStart, normalizedStop + 1));
    return "OK";
  }

  async publish(): Promise<number> {
    return 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key)) {
      return 0;
    }
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  pipeline(): { [key: string]: (...args: unknown[]) => unknown; exec: () => Promise<[]> } {
    const calls: Array<() => Promise<unknown>> = [];
    const pipeline = new Proxy(
      {
        exec: async () => {
          for (const call of calls) {
            await call();
          }
          return [];
        }
      },
      {
        get: (target, property) => {
          if (property in target) {
            return target[property as keyof typeof target];
          }
          return (...args: unknown[]) => {
            calls.push(() => (this[property as keyof this] as (...inner: unknown[]) => Promise<unknown>)(...args));
            return pipeline;
          };
        }
      }
    );
    return pipeline as { [key: string]: (...args: unknown[]) => unknown; exec: () => Promise<[]> };
  }

  private getHash(key: string): Map<string, string> {
    const current = this.store.get(key);
    if (current instanceof Map) {
      return current;
    }
    const next = new Map<string, string>();
    this.store.set(key, next);
    return next;
  }

  private getList(key: string): string[] {
    const current = this.store.get(key);
    if (Array.isArray(current)) {
      return current;
    }
    const next: string[] = [];
    this.store.set(key, next);
    return next;
  }

  private expireIfNeeded(key: string): void {
    const expiresAt = this.expirations.get(key);
    if (expiresAt && expiresAt <= Date.now()) {
      this.store.delete(key);
      this.expirations.delete(key);
    }
  }
}
