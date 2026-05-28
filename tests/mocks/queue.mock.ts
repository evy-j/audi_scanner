export interface AddedJob {
  name: string;
  data: unknown;
  options?: Record<string, unknown>;
}

export class InMemoryQueueMock {
  readonly jobs: AddedJob[] = [];

  async add(name: string, data: unknown, options?: Record<string, unknown>): Promise<AddedJob> {
    const job = { name, data, options };
    this.jobs.push(job);
    return job;
  }
}

export class QueueRegistryMock {
  private readonly queues = new Map<string, InMemoryQueueMock>();

  getQueue(name: string): InMemoryQueueMock {
    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }
    const queue = new InMemoryQueueMock();
    this.queues.set(name, queue);
    return queue;
  }

  getJobs(name: string): AddedJob[] {
    return this.getQueue(name).jobs;
  }
}
