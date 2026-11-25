/**
 * A data file of the app's in its data folder (<userData>/sessions.json...): main/jsonFile.ts's, its
 * failures in the log. Every store keeps its file through it.
 */
import { app } from 'electron'
import { join } from 'node:path'
import { jsonFile, type JsonFile } from './jsonFile.ts'
import { log } from './tracker.ts'

export const dataFile = (name: string, afterMs = 0): JsonFile =>
  jsonFile(() => join(app.getPath('userData'), name), afterMs, (err) => log(`${name}: not saved: ${String(err)}`))
