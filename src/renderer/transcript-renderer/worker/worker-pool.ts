
import { logger } from "../utils/logger";/**
 * Worker Pool Manager
 * Manages a pool of Web Workers for parallel data loading
 */

export interface WorkerTask {
  type: string;
  channelIndex: number;
  payload: any;
}

export interface WorkerResponse {
  type: string;
  channelIndex: number;
  data?: any;
  error?: string;
  name?: string;
}

interface QueuedTask {
  task: WorkerTask;
  resolve: (value: WorkerResponse) => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Set<Worker> = new Set();
  private busyWorkers: Map<Worker, number> = new Map();
  private taskQueue: QueuedTask[] = [];
  private maxWorkers: number;
  private workerUrl: URL;

  constructor(workerUrl: URL, maxWorkers: number = 20) {
    this.workerUrl = workerUrl;
    this.maxWorkers = maxWorkers;
  }

  /**
   * Execute a task using available worker or queue it
   */
  async executeTask(task: WorkerTask): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      // Try to get an available worker
      if (this.availableWorkers.size > 0) {
        const worker = Array.from(this.availableWorkers)[0];
        this.availableWorkers.delete(worker);
        this.runTask(worker, task, resolve, reject);
      }
      // Create new worker if under limit
      else if (this.workers.length < this.maxWorkers) {
        const worker = this.createWorker();
        this.workers.push(worker);
        this.runTask(worker, task, resolve, reject);
      }
      // Queue the task
      else {
        this.taskQueue.push({ task, resolve, reject });
      }
    });
  }

  /**
   * Create a new worker instance
   */
  private createWorker(): Worker {
    const worker = new Worker(this.workerUrl, { type: "module" });
    return worker;
  }

  /**
   * Run a task on a specific worker
   */
  private runTask(
    worker: Worker,
    task: WorkerTask,
    resolve: (value: WorkerResponse) => void,
    reject: (error: Error) => void,
  ) {
    this.busyWorkers.set(worker, task.channelIndex);

    const handler = (e: MessageEvent<WorkerResponse>) => {
      // Only handle messages for this specific task
      if (e.data.channelIndex === task.channelIndex) {
        worker.removeEventListener("message", handler);
        worker.removeEventListener("error", errorHandler);

        this.releaseWorker(worker);

        if (e.data.type === "error") {
          reject(new Error(e.data.error || "Unknown worker error"));
        } else {
          resolve(e.data);
        }
      }
    };

    const errorHandler = (error: ErrorEvent) => {
      worker.removeEventListener("message", handler);
      worker.removeEventListener("error", errorHandler);

      logger.error(
        `[WorkerPool] Worker error for channel ${task.channelIndex}:`,
        error,
      );

      this.releaseWorker(worker);
      reject(new Error(error.message || "Worker error"));
    };

    worker.addEventListener("message", handler);
    worker.addEventListener("error", errorHandler);
    worker.postMessage(task);
  }

  /**
   * Release a worker back to the pool or assign it a queued task
   */
  private releaseWorker(worker: Worker) {
    // const _channelIndex = this.busyWorkers.get(worker);
    this.busyWorkers.delete(worker);

    // If there are queued tasks, assign immediately
    if (this.taskQueue.length > 0) {
      const { task, resolve, reject } = this.taskQueue.shift()!;
      this.runTask(worker, task, resolve, reject);
    } else {
      this.availableWorkers.add(worker);
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.size,
      busyWorkers: this.busyWorkers.size,
      queuedTasks: this.taskQueue.length,
      maxWorkers: this.maxWorkers,
    };
  }

  /**
   * Destroy all workers and clear queue
   */
  destroy() {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.availableWorkers.clear();
    this.busyWorkers.clear();

    // Reject all queued tasks
    this.taskQueue.forEach(({ reject }) => {
      reject(new Error("Worker pool destroyed"));
    });
    this.taskQueue = [];
  }
}
