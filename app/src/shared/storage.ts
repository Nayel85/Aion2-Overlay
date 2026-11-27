/** What the app keeps on disk, for the Cache page: each kind with its size, and which can be cleared. */
export type StorageId = 'tiles' | 'browser' | 'logs' | 'updates' | 'recordings' | 'fights' | 'lokthar'

export interface StorageItem {
  id: StorageId
  bytes: number
  /** Cleared from the Cache page: a cache that is rebuilt, or files nobody needs again. */
  clearable: boolean
}

export interface StorageUsage {
  /** The app's data folder. */
  dir: string
  items: StorageItem[]
}

export const STORAGE_CLEARABLE: readonly StorageId[] = ['tiles', 'browser', 'logs', 'updates', 'recordings', 'lokthar']

/** 1536 → "1.5 KB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) (v /= 1024), i++
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}
