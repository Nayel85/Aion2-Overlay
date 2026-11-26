/** What the duty board's rewards count as, and what each is worth to you by default (settings.duty): apart from shared/duty.ts, which reads the item database. */
/** What a reward counts as. */
export type DutyCategory = 'kina' | 'goldCraft' | 'theostone' | 'goldEquipment' | 'cubeKey' | 'shugoKey' | 'nightmareTicket' | 'trialTicket' | 'fissureTicket' | 'odyle' | 'pureCraft'
export const DUTY_CATEGORIES: { id: DutyCategory; label: string; hint: string }[] = [
  { id: 'kina', label: 'Kina', hint: 'What 1 Kina is worth: 1 to count Kina, 0 to leave it out.' },
  { id: 'goldCraft', label: 'Gold crafting materials', hint: 'Each Unique or better material: Radiant gemstones and ores...' },
  { id: 'theostone', label: 'Theostones', hint: 'Each Theostone.' },
  { id: 'goldEquipment', label: 'Gold equipment', hint: 'Each Unique or better piece of equipment.' },
  { id: 'cubeKey', label: 'Hidden Cube keys', hint: 'Each Key: Hidden Cube.' },
  { id: 'shugoKey', label: 'Shugo Festival keys', hint: 'Each Shugo Festival Reward Key.' },
  { id: 'nightmareTicket', label: 'Nightmare tickets', hint: 'Each Nightmare Dungeon Challenge Ticket.' },
  { id: 'trialTicket', label: 'Ascension Trial tickets', hint: 'Each Ascension Trial Challenge Ticket.' },
  { id: 'fissureTicket', label: 'Unknown Fissure tickets', hint: 'Each Unknown Fissure Challenge Ticket.' },
  { id: 'odyle', label: 'Odyle Energy', hint: 'Each Odyle Energy; a Small Odyle Energy counts a quarter of one.' },
  { id: 'pureCraft', label: 'Pure crafting materials', hint: 'Each Pure (purple) gemstone, ore or log.' },
]
export type DutyValues = Record<DutyCategory, number>
/**
 * Kina, gold crafting materials and Theostones (the owner's choice), and a Hidden Cube's key at what
 * a cube gives sold to a merchant (~60,000: 11-12 Silentium at 5,000 and a Resurrection Spiritstone
 * at 1,000, two cubes of 2026-11-24/25, questlog's sell prices); the rest left out.
 */
export const DEFAULT_DUTY_VALUES: DutyValues = { kina: 1, goldCraft: 150_000, theostone: 150_000, goldEquipment: 0, cubeKey: 60_000, shugoKey: 0, nightmareTicket: 0, trialTicket: 0, fissureTicket: 0, odyle: 0, pureCraft: 0 }
