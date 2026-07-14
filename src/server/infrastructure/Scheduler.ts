export interface SchedulerJob {
  name: string;
  everyMs: number;
  runOnStart?: boolean;
  handler: () => Promise<void>;
}

interface RegisteredJob extends SchedulerJob {
  running: boolean;
  interval?: ReturnType<typeof setInterval>;
}

/**
 * In-process job runner. Apps register named jobs before start(); each job gets
 * its own interval with an overlap guard (a tick that fires while the previous
 * run is still in flight is skipped) and error isolation (a failing job never
 * takes down the process or other jobs).
 */
export class Scheduler {
  private static instance: Scheduler;
  private jobs = new Map<string, RegisteredJob>();
  private started = false;

  static getInstance(): Scheduler {
    if (!Scheduler.instance) Scheduler.instance = new Scheduler();
    return Scheduler.instance;
  }

  register(job: SchedulerJob): void {
    if (this.jobs.has(job.name)) throw new Error(`Scheduler job "${job.name}" is already registered`);
    this.jobs.set(job.name, { ...job, running: false });
    if (this.started) this.arm(this.jobs.get(job.name)!);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const job of this.jobs.values()) this.arm(job);
  }

  stop(): void {
    for (const job of this.jobs.values()) {
      if (job.interval) clearInterval(job.interval);
      job.interval = undefined;
    }
    this.started = false;
  }

  /** Manually trigger a job now, with the same overlap guard as its interval. */
  async runNow(name: string): Promise<void> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Scheduler job "${name}" is not registered`);
    await this.run(job);
  }

  private arm(job: RegisteredJob): void {
    if (job.runOnStart) void this.run(job);
    job.interval = setInterval(() => void this.run(job), job.everyMs);
  }

  private async run(job: RegisteredJob): Promise<void> {
    if (job.running) {
      console.warn(`Scheduler job "${job.name}" is still running — skipping this tick`);
      return;
    }
    job.running = true;
    try {
      await job.handler();
    } catch (e) {
      console.error(`Scheduler job "${job.name}" failed:`, e);
    } finally {
      job.running = false;
    }
  }
}
