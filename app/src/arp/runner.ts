/**
 * Runs an algorithm in the worker (public/arp-worker.js) and passes on what it reports. One
 * worker is kept warm between runs, since starting Python takes a few seconds; stopping a run
 * kills it, which is the only way to interrupt Python that is busy.
 */
import type { TransferMode } from '../mission/types'
import type { ArpInstance, RunEvent, WorkerResult } from './types'

export interface RunJob {
  instance: ArpInstance
  solver: string
  transfer: TransferMode
  budget: number
  seed: number
}

export interface RunCallbacks {
  /** Python is loading (first run, or after a stop). */
  onLoading: () => void
  /** The algorithm has started. */
  onStarted: () => void
  /** Reports from the algorithm, batched a few times a second. */
  onEvents: (events: RunEvent[]) => void
  onLog: (lines: string[]) => void
  onDone: (result: WorkerResult) => void
  /** The runner itself failed: Python could not be loaded, or the worker crashed. */
  onFailed: (message: string) => void
}

type WorkerMessage =
  | { type: 'ready' } | { type: 'started' } | { type: 'event'; event: RunEvent } | { type: 'log'; text: string }
  | { type: 'done'; result: WorkerResult } | { type: 'failed'; message: string }

export class AlgorithmRunner {
  private worker: Worker | null = null
  private callbacks: RunCallbacks | null = null
  private events: RunEvent[] = []
  private log: string[] = []
  private timer: number | undefined
  private warm = false

  get running(): boolean {
    return this.callbacks !== null
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const w = new Worker(new URL('arp-worker.js', document.baseURI))
    w.onmessage = (e: MessageEvent<WorkerMessage>) => this.receive(e.data)
    w.onerror = (e) => this.fail(e.message || 'the algorithm runner could not start')
    this.worker = w
    this.warm = false
    return w
  }

  private flush = (): void => {
    this.timer = undefined
    if (!this.callbacks) return
    if (this.events.length) {
      const batch = this.events
      this.events = []
      this.callbacks.onEvents(batch)
    }
    if (this.log.length) {
      const lines = this.log
      this.log = []
      this.callbacks.onLog(lines)
    }
  }

  private schedule(): void {
    this.timer ??= window.setTimeout(this.flush, 120)
  }

  private receive(m: WorkerMessage): void {
    if (m.type === 'ready') {
      this.warm = true
      return
    }
    const cb = this.callbacks
    if (!cb) return
    if (m.type === 'started') {
      this.warm = true
      cb.onStarted()
    } else if (m.type === 'event') {
      this.events.push(m.event)
      this.schedule()
    } else if (m.type === 'log') {
      this.log.push(m.text)
      this.schedule()
    } else if (m.type === 'done') {
      window.clearTimeout(this.timer)
      this.flush()
      this.callbacks = null
      cb.onDone(m.result)
    } else if (m.type === 'failed') {
      this.fail(m.message)
    }
  }

  private fail(message: string): void {
    const cb = this.callbacks
    window.clearTimeout(this.timer)
    this.flush()
    this.callbacks = null
    this.worker?.terminate()
    this.worker = null
    cb?.onFailed(message)
  }

  /** Load Python ahead of the first run. */
  prepare(): void {
    this.ensureWorker().postMessage({ type: 'boot' })
  }

  start(source: string, job: RunJob, callbacks: RunCallbacks): void {
    if (this.callbacks) this.stop()
    const w = this.ensureWorker()
    this.callbacks = callbacks
    this.events = []
    this.log = []
    if (!this.warm) callbacks.onLoading()
    w.postMessage({ type: 'run', source, job })
  }

  /** Abandon the run. Python cannot be interrupted, so the worker is discarded. */
  stop(): void {
    window.clearTimeout(this.timer)
    this.timer = undefined
    this.callbacks = null
    this.events = []
    this.log = []
    this.worker?.terminate()
    this.worker = null
  }
}
