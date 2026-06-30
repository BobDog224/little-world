import { describe, expect, it } from 'vitest'
import { gameContent } from '../../content/src/gameContent'
import { simulateBattle, validateArmy } from './battle'

describe('battle simulation', () => {
  it('keeps the same result for the same seed', () => {
    const input = {
      seed: 42,
      maxTicks: 200,
      attacker: {
        placements: [
          { unitId: 'behemoth', row: 2, col: 1, level: 1 },
          { unitId: 'footman', row: 1, col: 3, level: 1 },
          { unitId: 'archer', row: 4, col: 4, level: 1 },
        ],
      },
      defender: gameContent.tutorialLevels[0].defender,
    }

    const first = simulateBattle(input)
    const second = simulateBattle(input)

    expect(first).toEqual(second)
  })

  it('rejects multiple heroes in one army', () => {
    const result = validateArmy(
      {
        placements: [
          { unitId: 'behemoth', row: 0, col: 0, level: 1 },
          { unitId: 'succubus', row: 3, col: 3, level: 1 },
        ],
      },
      'A',
    )

    expect(result.ok).toBe(false)
  })

  it('keeps minimum damage above zero against heavy armor', () => {
    const result = simulateBattle({
      seed: 7,
      maxTicks: 40,
      attacker: {
        placements: [
          { unitId: 'behemoth', row: 2, col: 0, level: 1 },
          { unitId: 'archer', row: 1, col: 4, level: 1 },
        ],
      },
      defender: {
        placements: [
          { unitId: 'berserker', row: 2, col: 12, level: 1 },
          { unitId: 'knight', row: 1, col: 10, level: 1 },
        ],
      },
    })

    const damageEvent = result.events.find((event) => event.type === 'attack' && event.value !== undefined)

    expect(damageEvent).toBeDefined()
    expect(damageEvent?.value).toBeGreaterThanOrEqual(1)
  })

  it('lets ninja hit up to three targets in one attack cycle', () => {
    const result = simulateBattle({
      seed: 11,
      maxTicks: 1,
      attacker: {
        placements: [
          { unitId: 'behemoth', row: 2, col: 0, level: 1 },
          { unitId: 'ninja', row: 2, col: 6, level: 1 },
        ],
      },
      defender: {
        placements: [
          { unitId: 'berserker', row: 2, col: 8, level: 1 },
          { unitId: 'footman', row: 1, col: 9, level: 1 },
          { unitId: 'footman', row: 2, col: 10, level: 1 },
        ],
      },
    })

    const ninjaHits = result.events.filter((event) => event.sourceId?.includes('ninja') && event.type === 'attack')

    expect(ninjaHits).toHaveLength(3)
  })

  it('lets iron wheel bounce to a second target', () => {
    const result = simulateBattle({
      seed: 13,
      maxTicks: 1,
      attacker: {
        placements: [
          { unitId: 'behemoth', row: 2, col: 0, level: 1 },
          { unitId: 'iron_wheel', row: 1, col: 4, level: 1 },
        ],
      },
      defender: {
        placements: [
          { unitId: 'berserker', row: 2, col: 12, level: 1 },
          { unitId: 'footman', row: 1, col: 9, level: 1 },
          { unitId: 'footman', row: 2, col: 10, level: 1 },
        ],
      },
    })

    expect(result.events.some((event) => event.note?.includes('弹射'))).toBe(true)
  })

  it('lets shaman buff allies even when no one needs healing', () => {
    const result = simulateBattle({
      seed: 17,
      maxTicks: 1,
      attacker: {
        placements: [
          { unitId: 'behemoth', row: 2, col: 0, level: 1 },
          { unitId: 'shaman', row: 2, col: 4, level: 1 },
          { unitId: 'footman', row: 1, col: 5, level: 1 },
        ],
      },
      defender: {
        placements: [
          { unitId: 'berserker', row: 2, col: 12, level: 1 },
          { unitId: 'footman', row: 1, col: 10, level: 1 },
        ],
      },
    })

    expect(result.events.some((event) => event.type === 'buff' && event.sourceId?.includes('shaman'))).toBe(true)
  })

  it('lets archangel splash nearby enemies', () => {
    const result = simulateBattle({
      seed: 19,
      maxTicks: 1,
      attacker: {
        placements: [
          { unitId: 'behemoth', row: 2, col: 0, level: 1 },
          { unitId: 'archangel', row: 1, col: 4, level: 1 },
        ],
      },
      defender: {
        placements: [
          { unitId: 'berserker', row: 2, col: 12, level: 1 },
          { unitId: 'footman', row: 1, col: 9, level: 1 },
          { unitId: 'footman', row: 2, col: 10, level: 1 },
        ],
      },
    })

    expect(result.events.some((event) => event.note?.includes('圣焰波及'))).toBe(true)
  })
})
