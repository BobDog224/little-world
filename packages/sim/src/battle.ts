import { gameContent, spellById, unitById } from '../../content/src/gameContent'
import type {
  ArmorType,
  ArmySnapshot,
  BattleEvent,
  BattleInput,
  BattleResult,
  FormationPlacement,
  Side,
  UnitTemplate,
} from '../../shared/src/game'

interface BattleEntity {
  entityId: string
  unitId: string
  name: string
  side: Side
  row: number
  col: number
  width: number
  height: number
  maxHp: number
  hp: number
  attack: number
  armor: number
  armorType: ArmorType
  attackType: UnitTemplate['attackType']
  range: number
  attackIntervalTicks: number
  moveIntervalTicks: number
  nextAttackTick: number
  nextMoveTick: number
}

const counterMatrix: Record<
  'normal' | 'piercing' | 'magic' | 'hero',
  { strong: ArmorType[]; weak: ArmorType[] }
> = {
  normal: { strong: ['light'], weak: ['heavy'] },
  piercing: { strong: ['cloth'], weak: ['light'] },
  magic: { strong: ['heavy'], weak: ['cloth'] },
  hero: { strong: ['light', 'cloth', 'heavy'], weak: [] },
}

class XorShift32 {
  state: number

  constructor(seed: number) {
    this.state = seed || 1
  }

  next() {
    let value = this.state
    value ^= value << 13
    value ^= value >>> 17
    value ^= value << 5
    this.state = value >>> 0

    return this.state
  }
}

const rows = gameContent.battlefield.rows
const columns = gameContent.battlefield.columns

const getTemplate = (placement: FormationPlacement) => {
  const template = unitById[placement.unitId]

  if (!template) {
    throw new Error(`Unknown unit template: ${placement.unitId}`)
  }

  const index = Math.max(0, Math.min(template.levels.length - 1, placement.level - 1))

  return { template, stats: template.levels[index] }
}

const createEntities = (army: ArmySnapshot, side: Side): BattleEntity[] =>
  army.placements.map((placement, index) => {
    const { template, stats } = getTemplate(placement)

    return {
      entityId: `${side}-${placement.unitId}-${index + 1}`,
      unitId: placement.unitId,
      name: template.name,
      side,
      row: placement.row,
      col: placement.col,
      width: template.footprint.width,
      height: template.footprint.height,
      maxHp: stats.hp,
      hp: stats.hp,
      attack: stats.attack,
      armor: stats.armor,
      armorType: template.armorType,
      attackType: template.attackType,
      range: template.range,
      attackIntervalTicks: stats.attackIntervalTicks,
      moveIntervalTicks: stats.moveIntervalTicks,
      nextAttackTick: 0,
      nextMoveTick: 0,
    }
  })

const getCoveredRows = (entity: BattleEntity) =>
  Array.from({ length: entity.height }, (_, index) => entity.row + index)

const getVerticalGap = (source: BattleEntity, target: BattleEntity) => {
  const sourceRows = getCoveredRows(source)
  const targetRows = getCoveredRows(target)

  let minGap = Number.POSITIVE_INFINITY

  for (const sourceRow of sourceRows) {
    for (const targetRow of targetRows) {
      minGap = Math.min(minGap, Math.abs(sourceRow - targetRow))
    }
  }

  return minGap
}

const getForwardGap = (source: BattleEntity, target: BattleEntity) => {
  if (source.side === 'A') {
    return target.col - (source.col + source.width)
  }

  return source.col - (target.col + target.width)
}

const getDistance = (source: BattleEntity, target: BattleEntity) => {
  const forward = Math.max(0, getForwardGap(source, target))
  const vertical = getVerticalGap(source, target)

  return forward + vertical
}

const isAlive = (entity: BattleEntity) => entity.hp > 0

const getEntitiesInOrder = (entities: BattleEntity[]) =>
  [...entities]
    .filter(isAlive)
    .sort((left, right) => left.row - right.row || left.col - right.col || left.entityId.localeCompare(right.entityId))

const chooseEnemyTarget = (source: BattleEntity, entities: BattleEntity[]) =>
  getEntitiesInOrder(entities)
    .filter((entity) => entity.side !== source.side)
    .sort((left, right) => {
      const leftVertical = getVerticalGap(source, left)
      const rightVertical = getVerticalGap(source, right)
      const leftForward = Math.max(0, getForwardGap(source, left))
      const rightForward = Math.max(0, getForwardGap(source, right))

      return leftVertical - rightVertical || leftForward - rightForward || left.entityId.localeCompare(right.entityId)
    })[0]

const chooseHealTarget = (source: BattleEntity, entities: BattleEntity[]) =>
  getEntitiesInOrder(entities)
    .filter((entity) => entity.side === source.side && entity.hp < entity.maxHp)
    .filter((entity) => getDistance(source, entity) <= source.range - 1)
    .sort((left, right) => left.hp / left.maxHp - right.hp / right.maxHp || left.entityId.localeCompare(right.entityId))[0]

const isTargetInRange = (source: BattleEntity, target: BattleEntity) => getDistance(source, target) <= source.range - 1

const getDamage = (source: BattleEntity, target: BattleEntity) => {
  if (source.attackType === 'hero') {
    return Math.max(1, Math.floor((source.attack - target.armor) * 1.2))
  }

  if (source.attackType === 'heal') {
    return source.attack
  }

  const matrix = counterMatrix[source.attackType]
  const raw = source.attack - target.armor

  if (matrix.strong.includes(target.armorType)) {
    return Math.max(1, Math.floor(raw * 2))
  }

  if (matrix.weak.includes(target.armorType)) {
    return Math.max(1, Math.floor(raw * 0.75))
  }

  return Math.max(1, Math.floor(raw))
}

const collidesAt = (entity: BattleEntity, nextCol: number, entities: BattleEntity[]) => {
  const left = nextCol
  const right = nextCol + entity.width - 1
  const top = entity.row
  const bottom = entity.row + entity.height - 1

  return entities.some((other) => {
    if (!isAlive(other) || other.entityId === entity.entityId) {
      return false
    }

    const overlapsCols = left <= other.col + other.width - 1 && right >= other.col
    const overlapsRows = top <= other.row + other.height - 1 && bottom >= other.row

    return overlapsCols && overlapsRows
  })
}

const tryMove = (entity: BattleEntity, entities: BattleEntity[]) => {
  const direction = entity.side === 'A' ? 1 : -1
  const nextCol = entity.col + direction
  const staysInBounds = nextCol >= 0 && nextCol + entity.width <= columns

  if (!staysInBounds || collidesAt(entity, nextCol, entities)) {
    return false
  }

  entity.col = nextCol

  return true
}

const resolveCommands = (
  tick: number,
  entities: BattleEntity[],
  commands: BattleInput['commands'],
  events: BattleEvent[],
) => {
  for (const command of commands ?? []) {
    if (command.tick !== tick) {
      continue
    }

    const spell = spellById[command.spellId]

    if (!spell) {
      continue
    }

    const pool =
      spell.category === 'healing'
        ? getEntitiesInOrder(entities).filter((entity) => entity.side === command.side && entity.hp < entity.maxHp)
        : getEntitiesInOrder(entities).filter((entity) => entity.side !== command.side)

    const target =
      (command.targetEntityId ? pool.find((entity) => entity.entityId === command.targetEntityId) : undefined) ?? pool[0]

    if (!target) {
      continue
    }

    if (spell.category === 'healing') {
      const restored = Math.min(spell.baseValue, target.maxHp - target.hp)
      target.hp += restored
      events.push({ tick, type: 'spell', targetId: target.entityId, value: restored, note: `${spell.name} 治疗` })
      continue
    }

    target.hp = Math.max(0, target.hp - spell.baseValue)
    events.push({ tick, type: 'spell', targetId: target.entityId, value: spell.baseValue, note: `${spell.name} 命中` })

    if (target.hp === 0) {
      events.push({ tick, type: 'death', targetId: target.entityId, note: `${target.name} 倒下` })
    }
  }
}

export const validateArmy = (army: ArmySnapshot, side: Side) => {
  const deployStart = side === 'A' ? 0 : gameContent.battlefield.sideBDeployStart
  const deployEnd = side === 'A' ? gameContent.battlefield.sideADeployEnd : columns - 1
  const occupied = new Set<string>()
  let heroCount = 0

  for (const placement of army.placements) {
    const template = unitById[placement.unitId]

    if (!template) {
      return { ok: false, reason: `未知单位 ${placement.unitId}` }
    }

    if (template.kind === 'hero') {
      heroCount += 1
    }

    for (let rowOffset = 0; rowOffset < template.footprint.height; rowOffset += 1) {
      for (let colOffset = 0; colOffset < template.footprint.width; colOffset += 1) {
        const row = placement.row + rowOffset
        const col = placement.col + colOffset

        if (row < 0 || row >= rows || col < deployStart || col > deployEnd) {
          return { ok: false, reason: `${template.name} 越界` }
        }

        const key = `${row}:${col}`

        if (occupied.has(key)) {
          return { ok: false, reason: `${template.name} 与其他单位重叠` }
        }

        occupied.add(key)
      }
    }
  }

  if (heroCount !== 1) {
    return { ok: false, reason: '每支军队必须部署且仅部署 1 名英雄' }
  }

  return { ok: true as const }
}

export const simulateBattle = (input: BattleInput): BattleResult => {
  const attackerCheck = validateArmy(input.attacker, 'A')
  const defenderCheck = validateArmy(input.defender, 'B')

  if (!attackerCheck.ok) {
    throw new Error(attackerCheck.reason)
  }

  if (!defenderCheck.ok) {
    throw new Error(defenderCheck.reason)
  }

  const rng = new XorShift32(input.seed)
  const entities = [...createEntities(input.attacker, 'A'), ...createEntities(input.defender, 'B')]
  const events: BattleEvent[] = []
  const totalDamageBySide = { A: 0, B: 0 }

  for (let tick = 0; tick < input.maxTicks; tick += 1) {
    resolveCommands(tick, entities, input.commands, events)

    for (const side of ['A', 'B'] as const) {
      for (const entity of getEntitiesInOrder(entities).filter((candidate) => candidate.side === side)) {
        if (!isAlive(entity)) {
          continue
        }

        if (entity.attackType === 'heal') {
          const ally = chooseHealTarget(entity, entities)

          if (ally && tick >= entity.nextAttackTick) {
            const restored = Math.min(entity.attack, ally.maxHp - ally.hp)
            ally.hp += restored
            entity.nextAttackTick = tick + entity.attackIntervalTicks
            events.push({ tick, type: 'heal', sourceId: entity.entityId, targetId: ally.entityId, value: restored })
          }

          continue
        }

        const target = chooseEnemyTarget(entity, entities)

        if (!target) {
          continue
        }

        if (isTargetInRange(entity, target) && tick >= entity.nextAttackTick) {
          const jitter = rng.next() % 2
          const damage = getDamage(entity, target) + jitter
          target.hp = Math.max(0, target.hp - damage)
          totalDamageBySide[entity.side] += damage
          entity.nextAttackTick = tick + entity.attackIntervalTicks
          events.push({ tick, type: 'attack', sourceId: entity.entityId, targetId: target.entityId, value: damage })

          if (target.hp === 0) {
            events.push({ tick, type: 'death', targetId: target.entityId, note: `${target.name} 倒下` })
          }

          continue
        }

        if (!isTargetInRange(entity, target) && tick >= entity.nextMoveTick && tryMove(entity, entities)) {
          entity.nextMoveTick = tick + entity.moveIntervalTicks
          events.push({ tick, type: 'move', sourceId: entity.entityId, note: `${entity.name} 推进到 ${entity.col}` })
        }
      }
    }

    const attackersAlive = entities.some((entity) => entity.side === 'A' && isAlive(entity))
    const defendersAlive = entities.some((entity) => entity.side === 'B' && isAlive(entity))

    if (!attackersAlive || !defendersAlive) {
      return {
        winner: attackersAlive && !defendersAlive ? 'A' : defendersAlive && !attackersAlive ? 'B' : 'draw',
        endTick: tick,
        events,
        summary: {
          attackerLosses: entities.filter((entity) => entity.side === 'A' && !isAlive(entity)).length,
          defenderLosses: entities.filter((entity) => entity.side === 'B' && !isAlive(entity)).length,
          totalDamageBySide,
        },
      }
    }
  }

  return {
    winner: 'draw',
    endTick: input.maxTicks,
    events,
    summary: {
      attackerLosses: entities.filter((entity) => entity.side === 'A' && !isAlive(entity)).length,
      defenderLosses: entities.filter((entity) => entity.side === 'B' && !isAlive(entity)).length,
      totalDamageBySide,
    },
  }
}

export const getArmyPopulation = (army: ArmySnapshot) =>
  army.placements.reduce((total, placement) => total + unitById[placement.unitId].population, 0)
