/** What the duty board's rewards count as, and what each is worth to you by default (settings.duty): apart from shared/duty.ts, which reads the item database. */
/** What a reward counts as. */
export type DutyCategory = 'kina' | 'goldCraft' | 'theostone' | 'goldEquipment' | 'cubeKey' | 'shugoKey' | 'tickets' | 'pureCraft'
export const DUTY_CATEGORIES: { id: DutyCategory; label: string; hint: string }[] = [
  { id: 'kina', label: 'Kina', hint: 'What 1 Kina is worth: 1 to count Kina, 0 to leave it out.' },
  { id: 'goldCraft', label: 'Gold crafting materials', hint: 'Each Unique or better material: Radiant gemstones and ores...' },
  { id: 'theostone', label: 'Theostones', hint: 'Each Theostone.' },
  { id: 'goldEquipment', label: 'Gold equipment', hint: 'Each Unique or better piece of equipment.' },
  { id: 'cubeKey', label: 'Hidden Cube keys', hint: 'Each Key: Hidden Cube.' },
  { id: 'shugoKey', label: 'Shugo Festival keys', hint: 'Each Shugo Festival Reward Key.' },
  { id: 'tickets', label: 'Tickets and Odyle Energy', hint: 'Each Nightmare, Ascension Trial or Unknown Fissure ticket, or Odyle Energy.' },
  { id: 'pureCraft', label: 'Pure crafting materials', hint: 'Each Pure (purple) gemstone, ore or log.' },
]
export type DutyValues = Record<DutyCategory, number>
/** Kina, gold crafting materials and Theostones (the owner's choice); the rest left out. */
export const DEFAULT_DUTY_VALUES: DutyValues = { kina: 1, goldCraft: 150_000, theostone: 150_000, goldEquipment: 0, cubeKey: 0, shugoKey: 0, tickets: 0, pureCraft: 0 }
