import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arcanaStatLine, baseLines, skillLine, soulLine, stoneLine } from '../src/shared/equipment.ts'

test("an equipment's window as the game shows it: base stats with the enchantment, soul binding, stones", () => {
  // The owner's Aulamus Bow +10 (2026-11-23): questlog's base 278-350, +79 at +10.
  const bow = { itemLevel: 70, main: { weaponmindamage: 278, weapondamage: 350, weaponaccuracy: 100, critical: 100 }, enchants: { 10: { weapondamage: 79, weaponmindamage: 79 } } }
  assert.deepEqual(baseLines(bow, 10), [
    { label: 'Attack', value: '278–350 (+79)' },
    { label: 'Accuracy', value: '100' },
    { label: 'Critical Hit', value: '100' },
  ])
  // Its soul binding: HP 308, Combat Speed 9.7%, Critical Hit 51.
  assert.deepEqual([soulLine(0xc1, 308), soulLine(0x11a, 972), soulLine(0x80, 51)], [
    { label: 'HP', value: '308' },
    { label: 'Combat Speed', value: '9.72%' },
    { label: 'Critical Hit', value: '51' },
  ])
  // Its Superior Manastones: Attack +10 (gold), +3 (green); HP +50 (green).
  assert.deepEqual(stoneLine(531360004, 0x13d, 3), { label: 'Attack', value: '+10', grade: 41 })
  assert.deepEqual(stoneLine(531360004, 0x13d, 1), { label: 'Attack', value: '+3', grade: 21 })
  assert.deepEqual(stoneLine(531360004, 0xc1, 1), { label: 'HP', value: '+50', grade: 21 })
  // Bakarma Boots' Lesser Manastones: Critical Hit +5 (white), Accuracy Bonus +7 (green).
  assert.deepEqual(stoneLine(531360001, 0x80, 1), { label: 'Critical Hit', value: '+5', grade: 11 })
  assert.deepEqual(stoneLine(531360001, 0x68, 2), { label: 'Accuracy Bonus', value: '+7', grade: 21 })
  // Out of the most it can roll there, as the game's soul binding window: "308/361".
  assert.equal(soulLine(0xc1, 308, { hpmax: 361 }).value, '308/361')
  // Vakron Greaves': Front Defense 232, Evasion 23, Critical Damage Defense 228; its Wind Vigor +1.
  assert.deepEqual([soulLine(0x24c, 232).label, soulLine(0x138, 23).label, soulLine(0x29, 228).label], ['Front Defense', 'Evasion', 'Critical Damage Defense'])
  assert.deepEqual(skillLine(14730000, 1), { label: 'Wind Vigor', value: 'Lv. +1' })
  // The Chalice of Vigor's Time [Siel] 21; a code not matched yet, told by its number.
  assert.deepEqual(arcanaStatLine(0x0b, 21), { label: 'Time [Siel]', value: '21' })
  assert.equal(soulLine(0x1aa, 285).label, 'Stat 0x1aa')
})
