// Where each pet comes from (data/petSources.json, scripts/fetch-pet-sources.mjs): open-world
// monsters, bosses alone, instances alone, or no monster at all (the Black Cloud Merchant's), with
// the bosses and instances by name; for the merchant's window, the Pets page and the maps.
import data from '@/data/petSources.json'
import { zoneName } from '@shared/worlds.ts'

export type PetSourceKind = 'field' | 'boss' | 'instance' | 'merchant'
export interface PetSource {
  kind: PetSourceKind
  bosses?: { npc: number; name: string; level: number }[]
  instances?: number[]
  other?: string[]
}
const SOURCES = (data as { pets: Record<string, PetSource> }).pets
export const PET_SOURCES_DATE = (data as { fetched: string }).fetched

export const petSource = (pet: number): PetSource | null => SOURCES[pet] ?? null
/** The monsters that are bosses (questlog's heromonster), by npc id: their spawns stand out on the maps. */
export const BOSS_NPCS = new Set(Object.values(SOURCES).flatMap((s) => (s.bosses ?? []).map((b) => b.npc)))

/**
 * What to tell about a pet's source, or null for an ordinary one (open-world monsters): its tone and
 * its words ("Boss: Divine Ansas", "Instance: Fire Temple", "Black Cloud Merchant only").
 */
export function petSourceTag(pet: number): { kind: Exclude<PetSourceKind, 'field'>; text: string; title: string } | null {
  const s = petSource(pet)
  if (!s || s.kind === 'field') return null
  if (s.kind === 'boss') {
    const names = (s.bosses ?? []).map((b) => b.name)
    return { kind: 'boss', text: `Boss: ${names.join(', ')}`, title: (s.bosses ?? []).map((b) => `${b.name} (Lv${b.level})`).join(', ') }
  }
  if (s.kind === 'instance') {
    const names = (s.instances ?? []).map(zoneName)
    return { kind: 'instance', text: `Instance: ${names.join(', ')}`, title: names.join(', ') }
  }
  // No monster: the merchant's, unless another source is known (a festival's merchant, a pack).
  return s.other?.length
    ? { kind: 'merchant', text: s.other.join(', '), title: s.other.join(', ') }
    : { kind: 'merchant', text: 'Black Cloud Merchant only', title: 'No monster drops its soul: the Black Cloud Merchant sells it' }
}
