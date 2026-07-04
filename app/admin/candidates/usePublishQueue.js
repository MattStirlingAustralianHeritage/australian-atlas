'use client'

/**
 * usePublishQueue — background publisher for Candidate Review.
 *
 * The publish/reject POST to /api/admin/candidates/[id] does the heavy work
 * (fetch website → Claude enrichment → geocode → vertical-DB push → listing
 * create), which takes 5–15s. Historically the review card AWAITED that call
 * and then sat on a 3s auto-advance dwell, so the reviewer idled 8–18s per
 * candidate — the throughput bottleneck.
 *
 * This hook decouples the reviewer's DECISION from that slow work. The card
 * advances instantly (optimistic) and hands the task here; the actual POST runs
 * in a small bounded-concurrency background queue. The reviewer moves at
 * keyboard speed while listings publish behind them.
 *
 * Safety: the approve handler only marks a candidate `converted` at the very
 * end, after the listing is created. So a background publish that fails leaves
 * the candidate `pending` in the DB — it reappears on the next page load and is
 * never lost. Failures also surface in the tray with a one-click Retry.
 *
 * Undo: every task waits GRACE_MS in the queue before it dispatches. During
 * that window the decision can be pulled back (cancel) — nothing has hit the
 * server yet — which gives fast reviewers a clean "oops" for a mis-fire.
 *
 * Bookkeeping: completed tasks are pruned from `tasks` and rolled into `counts`
 * so the list stays bounded over a 1000-candidate session; only in-flight
 * (queued/running) and failed tasks remain in `tasks`.
 */

import { useState, useRef, useCallback, useEffect } from 'react'

const MAX_CONCURRENT = 3      // parallel publishes — pipelines a burst without hammering Claude / vertical DBs
const GRACE_MS = 1200         // undo window before a queued task actually dispatches

let _seq = 0
function nextId() {
  _seq += 1
  return `pub_${Date.now().toString(36)}_${_seq}`
}

/**
 * @param {object} opts
 * @param {(task, data) => void} [opts.onPublished] Called when an approve task lands live.
 * @returns {{
 *   tasks: object[],
 *   counts: { published:number, rejected:number },
 *   stats: { running:number, queued:number, failed:number, active:number, published:number, rejected:number },
 *   enqueue: (task) => string,
 *   cancel: (id) => boolean,
 *   retry: (id) => void,
 *   dismiss: (id) => void,
 * }}
 */
export function usePublishQueue({ onPublished } = {}) {
  // tasks holds only in-flight (queued/running) and failed tasks; completed
  // tasks are pruned and counted so the list stays bounded.
  const [tasks, setTasks] = useState([])
  const [counts, setCounts] = useState({ published: 0, rejected: 0 })
  // Bump to nudge the scheduling effect when a grace timer / slot frees up.
  const [tick, setTick] = useState(0)

  // Guards against double-dispatching the same task (StrictMode double-invokes
  // effects in dev; also protects against overlapping scheduler passes).
  const startedRef = useRef(new Set())
  const onPublishedRef = useRef(onPublished)
  useEffect(() => { onPublishedRef.current = onPublished }, [onPublished])

  const runTask = useCallback((task) => {
    if (startedRef.current.has(task.id)) return
    startedRef.current.add(task.id)
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: 'running', error: null } : t)))

    ;(async () => {
      try {
        const res = await fetch(`/api/admin/candidates/${task.candidateId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task.payload),
        })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          setTasks(prev => prev.map(t => (
            t.id === task.id ? { ...t, status: 'error', error: data.error || `Publish failed (HTTP ${res.status})` } : t
          )))
        } else if (data.action === 'rejected' && task.kind === 'approve') {
          // Server auto-rejected on a hard gate (e.g. no website URL). Not a
          // crash, but not a live listing — surface why so the reviewer knows.
          setTasks(prev => prev.map(t => (
            t.id === task.id ? { ...t, status: 'error', error: data.reason || 'Auto-rejected by publish gate' } : t
          )))
        } else {
          // Success (a vertical-sync warning is non-fatal — the listing is live
          // on master and the sync cron retries the vertical push). Prune + count.
          setTasks(prev => prev.filter(t => t.id !== task.id))
          setCounts(prev => task.kind === 'approve'
            ? { ...prev, published: prev.published + 1 }
            : { ...prev, rejected: prev.rejected + 1 })
          if (task.kind === 'approve' && onPublishedRef.current) {
            onPublishedRef.current(task, data)
          }
        }
      } catch (err) {
        setTasks(prev => prev.map(t => (
          t.id === task.id ? { ...t, status: 'error', error: err.message || 'Network error' } : t
        )))
      } finally {
        // Free the slot and let the scheduler start the next queued task.
        setTick(x => x + 1)
      }
    })()
  }, [])

  // Scheduler: start queued tasks whose grace window has elapsed, up to the
  // concurrency cap. Re-runs whenever tasks change or a grace timer fires.
  useEffect(() => {
    const now = Date.now()
    const running = tasks.filter(t => t.status === 'running').length
    let slots = MAX_CONCURRENT - running
    if (slots <= 0) return

    const queued = tasks
      .filter(t => t.status === 'queued' && !startedRef.current.has(t.id))
      .sort((a, b) => a.queuedAt - b.queuedAt)

    let earliest = Infinity
    for (const t of queued) {
      if (slots <= 0) break
      const readyAt = t.queuedAt + GRACE_MS
      if (readyAt <= now) {
        runTask(t)
        slots -= 1
      } else if (readyAt < earliest) {
        earliest = readyAt
      }
    }

    if (earliest !== Infinity) {
      const timer = setTimeout(() => setTick(x => x + 1), Math.max(50, earliest - now))
      return () => clearTimeout(timer)
    }
  }, [tasks, tick, runTask])

  const enqueue = useCallback((task) => {
    const id = nextId()
    setTasks(prev => [...prev, {
      id,
      status: 'queued',
      error: null,
      queuedAt: Date.now(),
      ...task,
    }])
    return id
  }, [])

  // Pull a decision back — only possible while it's still queued (grace window),
  // i.e. before anything has hit the server. Returns true if it was cancelled.
  const cancel = useCallback((id) => {
    const t = tasks.find(x => x.id === id)
    if (!t || t.status !== 'queued') return false
    startedRef.current.add(id) // belt-and-braces: never let the scheduler grab it
    setTasks(prev => prev.filter(x => x.id !== id))
    return true
  }, [tasks])

  const retry = useCallback((id) => {
    startedRef.current.delete(id)
    setTasks(prev => prev.map(t => (
      // queuedAt in the past → dispatches immediately on the next scheduler pass
      t.id === id ? { ...t, status: 'queued', error: null, queuedAt: Date.now() - GRACE_MS } : t
    )))
    setTick(x => x + 1)
  }, [])

  const dismiss = useCallback((id) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  const running = tasks.filter(t => t.status === 'running').length
  const queued = tasks.filter(t => t.status === 'queued').length
  const failed = tasks.filter(t => t.status === 'error').length
  const stats = {
    running,
    queued,
    failed,
    active: running + queued,
    published: counts.published,
    rejected: counts.rejected,
  }

  return { tasks, counts, stats, enqueue, cancel, retry, dismiss }
}

export { GRACE_MS, MAX_CONCURRENT }
