// Focus Meet — Cooperative Multitasking Scheduler
// Prevents main thread blocking during heavy P2P tree operations by yielding
// control back to the browser within each frame budget (4ms per task slice).
//
// ARCHITECTURE:
// - Priority-based task queue: critical > high > normal > low
// - requestIdleCallback with setTimeout(0) fallback for scheduling
// - Deadline-aware execution: yields when time is up within a frame
// - Chunked processing for bulk operations (e.g., scoring 200 relay nodes)
// - Task cancellation by ID for cleanup and abort scenarios
// - Metrics tracking for performance monitoring and debugging
//
// USAGE EXAMPLES:
// ```ts
// // Simple task with priority
// const taskId = coopScheduler.schedule(() => updateStreamQuality(), 'high');
//
// // Chunked processing (e.g., scoring relay candidates)
// coopScheduler.scheduleChunked(relayNodes, (node, i) => scoreRelay(node), {
//   priority: 'high',
//   chunkSize: 50,
// });
//
// // Cancel a task
// coopScheduler.cancel(taskId);
//
// // Get metrics
// const metrics = coopScheduler.getMetrics();
// ```

// ============ TYPES ============

/** Task priority levels, ordered by urgency. */
export type Priority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Numeric priority weights — higher values are processed first.
 * Critical tasks (stream/connections) always run before everything else.
 */
const PRIORITY_WEIGHT: Record<Priority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
} as const;

/** All priority levels in descending order for queue draining. */
const PRIORITY_ORDER: Priority[] = ['critical', 'high', 'normal', 'low'];

/**
 * Options for chunked task scheduling.
 * @template T - The type of items being processed.
 */
export interface ChunkedTaskOptions<T> {
  /** Task priority. Defaults to 'normal'. */
  priority?: Priority;
  /** Number of items to process per chunk before yielding. Defaults to 50. */
  chunkSize?: number;
  /** Optional label for debugging and metrics. */
  label?: string;
}

/**
 * Metrics snapshot from the scheduler.
 * Useful for performance monitoring, debugging, and adaptive behavior.
 */
export interface SchedulerMetrics {
  /** Total number of tasks completed (including all chunks of chunked tasks). */
  tasksCompleted: number;
  /** Total number of tasks cancelled before completion. */
  tasksCancelled: number;
  /** Average execution time per task in milliseconds. */
  avgExecutionTimeMs: number;
  /** Total number of yields (times a task voluntarily gave up the main thread). */
  totalYields: number;
  /** Average yields per task. */
  avgYieldsPerTask: number;
  /** Current number of pending tasks in the queue, broken down by priority. */
  pendingByPriority: Record<Priority, number>;
  /** Total pending tasks across all priorities. */
  totalPending: number;
  /** Whether the scheduler is currently processing a task. */
  isRunning: boolean;
  /** Peak queue depth observed. */
  peakQueueDepth: number;
  /** Number of deadline-expired yields (yields caused by running out of idle time). */
  deadlineExpiredYields: number;
  /** Number of frame-budget yields (yields caused by exceeding 4ms slice). */
  frameBudgetYields: number;
}

/**
 * Internal representation of a scheduled task.
 */
interface ScheduledTask {
  /** Unique task identifier. */
  id: string;
  /** The function to execute. */
  execute: () => boolean | void;
  /** Task priority level. */
  priority: Priority;
  /** Numeric weight derived from priority. */
  weight: number;
  /** Whether the task has been cancelled. */
  cancelled: boolean;
  /** Timestamp when the task was scheduled. */
  createdAt: number;
  /** Optional label for debugging. */
  label?: string;
  /** Running count of yields for this task. */
  yieldCount: number;
  /** Running total of execution time for this task (ms). */
  executionTimeMs: number;
}

/**
 * Extended IdleDeadline-like interface for internal use.
 * Normalizes requestIdleCallback deadline and our setTimeout fallback.
 */
interface SchedulingDeadline {
  /** Milliseconds remaining in the current idle period. */
  timeRemaining: () => number;
  /** Whether the idle callback was invoked because the deadline expired. */
  didTimeout: boolean;
}

// ============ CONSTANTS ============

/** Maximum continuous execution time before yielding (one frame budget slice). */
const FRAME_BUDGET_MS = 4;

/** Default chunk size for chunked tasks. */
const DEFAULT_CHUNK_SIZE = 50;

/** Minimum time remaining (ms) to continue processing within a deadline. */
const MIN_TIME_REMAINING_MS = 0.5;

/** Counter for generating unique task IDs. */
let taskIdCounter = 0;

// ============ SCHEDULER IMPLEMENTATION ============

/**
 * Cooperative multitasking scheduler that prevents main thread blocking
 * during heavy P2P tree operations in Focus Meet.
 *
 * Tasks are scheduled with priorities and executed during browser idle periods.
 * Long-running tasks yield control back to the browser every 4ms (one frame budget),
 * and chunked tasks break large collections into manageable batches with yields
 * between them.
 *
 * The scheduler is deadline-aware: it checks `requestIdleCallback`'s deadline
 * before continuing each chunk, and re-schedules remaining work if time is up.
 */
export class CoopScheduler {
  // --------------- State ---------------

  /** Priority buckets — each bucket is a queue of tasks at that priority. */
  private queues: Record<Priority, ScheduledTask[]> = {
    critical: [],
    high: [],
    normal: [],
    low: [],
  };

  /** Map of task ID → task for O(1) cancellation lookups. */
  private taskMap: Map<string, ScheduledTask> = new Map();

  /** Whether the scheduler is currently draining the queue. */
  private isRunning = false;

  /** Whether the scheduler has been destroyed and should not accept new work. */
  private destroyed = false;

  /** Handle for the current scheduling callback (requestIdleCallback or setTimeout). */
  private schedulingHandle: number | null = null;

  // --------------- Metrics ---------------

  private tasksCompleted = 0;
  private tasksCancelled = 0;
  private totalYields = 0;
  private peakQueueDepth = 0;
  private deadlineExpiredYields = 0;
  private frameBudgetYields = 0;

  /** Accumulated execution times for computing averages. */
  private executionTimes: number[] = [];

  // --------------- Platform Detection ---------------

  /** Whether requestIdleCallback is available in the current environment. */
  private readonly supportsIdleCallback: boolean;

  constructor() {
    this.supportsIdleCallback =
      typeof window !== 'undefined' &&
      typeof window.requestIdleCallback === 'function';
  }

  // ============ PUBLIC API ============

  /**
   * Schedule a task for cooperative execution.
   *
   * The task function may return `true` to indicate it has more work to do
   * and should be re-scheduled at the same priority. Return `false` or
   * `undefined` to mark the task as complete.
   *
   * @param task - The function to execute. Return `true` to re-schedule.
   * @param priority - Task priority. Defaults to 'normal'.
   * @param label - Optional label for debugging and metrics.
   * @returns A unique task ID that can be used to cancel the task.
   *
   * @example
   * ```ts
   * // Schedule a critical stream update
   * const id = scheduler.schedule(() => {
   *   updateStreamConnections();
   * }, 'critical');
   *
   * // Schedule a re-occurring task that re-schedules itself
   * scheduler.schedule(() => {
   *   const hasMore = processNextBatch();
   *   return hasMore; // true = re-schedule, false = done
   * }, 'high');
   * ```
   */
  schedule(task: () => boolean | void, priority: Priority = 'normal', label?: string): string {
    if (this.destroyed) {
      console.warn('[CoopScheduler] Cannot schedule task: scheduler has been destroyed');
      return '';
    }

    const id = this.generateTaskId();
    const scheduledTask: ScheduledTask = {
      id,
      execute: task,
      priority,
      weight: PRIORITY_WEIGHT[priority],
      cancelled: false,
      createdAt: performance.now(),
      label,
      yieldCount: 0,
      executionTimeMs: 0,
    };

    this.enqueueTask(scheduledTask);
    this.ensureScheduled();

    return id;
  }

  /**
   * Schedule a chunked processing task that breaks a large collection into
   * manageable batches, yielding between chunks to prevent main thread blocking.
   *
   * This is ideal for operations like scoring 200 relay nodes, updating
   * bandwidth stats for all peers, or cleaning up disconnected nodes.
   *
   * @param items - The array of items to process.
   * @param processor - Function called for each item with its index.
   * @param options - Chunking and priority options.
   * @returns A unique task ID that can be used to cancel the chunked task.
   *
   * @example
   * ```ts
   * // Score 200 relay nodes in chunks of 50
   * scheduler.scheduleChunked(relayCandidates, (node, i) => {
   *   const score = calculateRelayScore(node);
   *   scoreMap.set(node.peerId, score);
   * }, { priority: 'high', chunkSize: 50 });
   * ```
   */
  scheduleChunked<T>(
    items: T[],
    processor: (item: T, index: number) => void,
    options?: ChunkedTaskOptions<T>
  ): string {
    if (this.destroyed) {
      console.warn('[CoopScheduler] Cannot schedule chunked task: scheduler has been destroyed');
      return '';
    }

    if (items.length === 0) {
      // No items — nothing to do, return a dummy ID
      return this.generateTaskId();
    }

    const priority: Priority = options?.priority ?? 'normal';
    const chunkSize: number = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const label: string | undefined = options?.label;
    const totalItems = items.length;

    // Track progress across yields using closure state
    let nextIndex = 0;

    const taskId = this.generateTaskId();

    const chunkedExecute = (): boolean => {
      const chunkEnd = Math.min(nextIndex + chunkSize, totalItems);

      for (let i = nextIndex; i < chunkEnd; i++) {
        processor(items[i], i);
      }

      nextIndex = chunkEnd;

      // Return true if there are more items to process (re-schedule)
      return nextIndex < totalItems;
    };

    const scheduledTask: ScheduledTask = {
      id: taskId,
      execute: chunkedExecute,
      priority,
      weight: PRIORITY_WEIGHT[priority],
      cancelled: false,
      createdAt: performance.now(),
      label: label ?? `chunked:${totalItems}items`,
      yieldCount: 0,
      executionTimeMs: 0,
    };

    this.enqueueTask(scheduledTask);
    this.ensureScheduled();

    return taskId;
  }

  /**
   * Cancel a previously scheduled task by its ID.
   *
   * If the task is currently executing, it will be stopped before its next
   * chunk or re-schedule. If the task has already completed or was already
   * cancelled, this is a no-op.
   *
   * @param taskId - The ID returned by `schedule()` or `scheduleChunked()`.
   *
   * @example
   * ```ts
   * const id = scheduler.schedule(longRunningTask, 'low');
   * // ... later, decide to cancel
   * scheduler.cancel(id);
   * ```
   */
  cancel(taskId: string): void {
    const task = this.taskMap.get(taskId);
    if (!task) return;

    task.cancelled = true;
    this.tasksCancelled++;

    // Remove from queue (O(n) per bucket, but queues are typically small)
    const bucket = this.queues[task.priority];
    const idx = bucket.indexOf(task);
    if (idx !== -1) {
      bucket.splice(idx, 1);
    }

    this.taskMap.delete(taskId);
  }

  /**
   * Get a snapshot of the scheduler's current metrics.
   *
   * Useful for performance monitoring dashboards, adaptive quality decisions,
   * and debugging scheduler behavior under load.
   *
   * @returns A frozen metrics snapshot.
   */
  getMetrics(): SchedulerMetrics {
    const pendingByPriority: Record<Priority, number> = {
      critical: this.queues.critical.length,
      high: this.queues.high.length,
      normal: this.queues.normal.length,
      low: this.queues.low.length,
    };

    const totalPending = pendingByPriority.critical + pendingByPriority.high +
      pendingByPriority.normal + pendingByPriority.low;

    const avgExecutionTimeMs = this.executionTimes.length > 0
      ? this.executionTimes.reduce((sum, t) => sum + t, 0) / this.executionTimes.length
      : 0;

    const avgYieldsPerTask = this.tasksCompleted > 0
      ? this.totalYields / this.tasksCompleted
      : 0;

    return Object.freeze({
      tasksCompleted: this.tasksCompleted,
      tasksCancelled: this.tasksCancelled,
      avgExecutionTimeMs: Math.round(avgExecutionTimeMs * 100) / 100,
      totalYields: this.totalYields,
      avgYieldsPerTask: Math.round(avgYieldsPerTask * 100) / 100,
      pendingByPriority,
      totalPending,
      isRunning: this.isRunning,
      peakQueueDepth: this.peakQueueDepth,
      deadlineExpiredYields: this.deadlineExpiredYields,
      frameBudgetYields: this.frameBudgetYields,
    });
  }

  /**
   * Destroy the scheduler, cancelling all pending tasks and preventing
   * new tasks from being scheduled.
   *
   * Call this during cleanup (e.g., when leaving a Focus Meet room) to
   * ensure no orphaned tasks continue running.
   */
  destroy(): void {
    this.destroyed = true;

    // Cancel any pending scheduling callback
    if (this.schedulingHandle !== null) {
      if (this.supportsIdleCallback) {
        try { window.cancelIdleCallback(this.schedulingHandle); } catch {}
      } else {
        clearTimeout(this.schedulingHandle);
      }
      this.schedulingHandle = null;
    }

    // Clear all queues
    for (const priority of PRIORITY_ORDER) {
      this.queues[priority] = [];
    }

    // Count remaining tasks as cancelled
    this.tasksCancelled += this.taskMap.size;
    this.taskMap.clear();

    this.isRunning = false;
  }

  // ============ PRIVATE: SCHEDULING ============

  /**
   * Add a task to the appropriate priority queue.
   */
  private enqueueTask(task: ScheduledTask): void {
    this.queues[task.priority].push(task);
    this.taskMap.set(task.id, task);

    // Track peak depth
    const currentDepth = this.totalQueueDepth();
    if (currentDepth > this.peakQueueDepth) {
      this.peakQueueDepth = currentDepth;
    }
  }

  /**
   * Ensure a scheduling callback is pending. If one is already pending,
   * this is a no-op to avoid double-scheduling.
   */
  private ensureScheduled(): void {
    if (this.schedulingHandle !== null) return;
    if (this.destroyed) return;

    this.schedulingHandle = this.requestScheduling(this.boundProcessQueue);
  }

  /**
   * Request a scheduling callback using requestIdleCallback if available,
   * falling back to setTimeout(0) otherwise.
   */
  private requestScheduling(callback: (deadline: SchedulingDeadline) => void): number {
    if (this.supportsIdleCallback) {
      return window.requestIdleCallback(callback as IdleRequestCallback, { timeout: 100 });
    }
    // Fallback: simulate an infinite deadline with setTimeout(0)
    return window.setTimeout(() => {
      callback({
        timeRemaining: () => FRAME_BUDGET_MS,
        didTimeout: false,
      });
    }, 0) as unknown as number;
  }

  /**
   * Bound reference to processQueue for stable callback identity.
   */
  private readonly boundProcessQueue = this.processQueue.bind(this);

  /**
   * Main queue processing loop. Drains tasks from the highest-priority
   * queues first, yielding when the deadline expires or the frame budget
   * is exceeded.
   */
  private processQueue(deadline: SchedulingDeadline): void {
    this.schedulingHandle = null;

    if (this.destroyed) return;

    this.isRunning = true;
    const loopStart = performance.now();

    try {
      while (this.hasPendingTasks()) {
        // Check deadline — if time is up, re-schedule the rest
        const timeRemaining = deadline.timeRemaining();
        if (timeRemaining <= MIN_TIME_REMAINING_MS) {
          this.deadlineExpiredYields++;
          this.totalYields++;
          break;
        }

        // Check frame budget — if we've been running too long, yield
        const elapsed = performance.now() - loopStart;
        if (elapsed >= FRAME_BUDGET_MS) {
          this.frameBudgetYields++;
          this.totalYields++;
          break;
        }

        // Pick the highest-priority task
        const task = this.pickNextTask();
        if (!task) break;

        // Skip cancelled tasks
        if (task.cancelled) {
          this.removeTask(task);
          continue;
        }

        // Execute the task and measure time
        const taskStart = performance.now();
        let wantsReschedule = false;

        try {
          const result = task.execute();
          wantsReschedule = result === true;
        } catch (error) {
          console.error(
            `[CoopScheduler] Task "${task.label ?? task.id}" threw an error:`,
            error
          );
          // Don't re-schedule errored tasks
          wantsReschedule = false;
        }

        const taskDuration = performance.now() - taskStart;
        task.executionTimeMs += taskDuration;

        if (task.cancelled) {
          // Task was cancelled during execution
          this.removeTask(task);
          continue;
        }

        if (wantsReschedule) {
          // Task wants to continue later — keep it in the queue
          task.yieldCount++;
          // Don't remove from queue; it stays at its priority position
        } else {
          // Task is complete
          this.executionTimes.push(task.executionTimeMs);
          this.tasksCompleted++;
          this.removeTask(task);
        }
      }
    } finally {
      this.isRunning = false;

      // If there are still pending tasks, schedule another round
      if (this.hasPendingTasks() && !this.destroyed) {
        this.ensureScheduled();
      }
    }
  }

  // ============ PRIVATE: QUEUE MANAGEMENT ============

  /**
   * Pick the next task to execute, preferring higher priorities.
   * Within the same priority, FIFO order is preserved.
   */
  private pickNextTask(): ScheduledTask | null {
    for (const priority of PRIORITY_ORDER) {
      const queue = this.queues[priority];
      // Skip cancelled tasks at the front of the queue
      while (queue.length > 0 && queue[0].cancelled) {
        const cancelled = queue.shift()!;
        this.taskMap.delete(cancelled.id);
      }
      if (queue.length > 0) {
        return queue[0]; // Peek, don't remove — will be removed after execution
      }
    }
    return null;
  }

  /**
   * Remove a task from its priority queue and the task map.
   */
  private removeTask(task: ScheduledTask): void {
    const bucket = this.queues[task.priority];
    const idx = bucket.indexOf(task);
    if (idx !== -1) {
      bucket.splice(idx, 1);
    }
    this.taskMap.delete(task.id);
  }

  /**
   * Check if any queue has pending (non-cancelled) tasks.
   */
  private hasPendingTasks(): boolean {
    for (const priority of PRIORITY_ORDER) {
      if (this.queues[priority].length > 0) return true;
    }
    return false;
  }

  /**
   * Get the total number of tasks across all priority queues.
   */
  private totalQueueDepth(): number {
    let total = 0;
    for (const priority of PRIORITY_ORDER) {
      total += this.queues[priority].length;
    }
    return total;
  }

  // ============ PRIVATE: UTILITIES ============

  /**
   * Generate a unique task ID.
   */
  private generateTaskId(): string {
    return `coop-${++taskIdCounter}-${Date.now().toString(36)}`;
  }
}

// ============ SINGLETON ============

/**
 * Global cooperative scheduler singleton for Focus Meet.
 *
 * Use this instance throughout the application to schedule P2P tree
 * operations without blocking the main thread.
 *
 * @example
 * ```ts
 * import { coopScheduler } from '@/lib/coop-scheduler';
 *
 * // Schedule relay scoring as a high-priority chunked task
 * coopScheduler.scheduleChunked(relayNodes, scoreRelay, {
 *   priority: 'high',
 *   chunkSize: 50,
 * });
 *
 * // Schedule stream health update as critical
 * coopScheduler.schedule(checkStreamHealth, 'critical');
 *
 * // Schedule cleanup as low priority
 * coopScheduler.schedule(removeStaleNodes, 'low');
 * ```
 */
export const coopScheduler = new CoopScheduler();
