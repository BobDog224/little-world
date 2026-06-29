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
})
