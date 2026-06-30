export type Side = 'A' | 'B'

export type AttackType = 'normal' | 'piercing' | 'magic' | 'hero' | 'heal'

export type ArmorType = 'light' | 'cloth' | 'heavy' | 'hero'

export type ResourceId = 'gold' | 'crystal'

export interface Footprint {
  width: number
  height: number
}

export interface UnitLevelStats {
  hp: number
  attack: number
  armor: number
  attackIntervalTicks: number
  moveIntervalTicks: number
}

export interface UnitTemplate {
  id: string
  name: string
  kind: 'hero' | 'unit'
  attackType: AttackType
  armorType: ArmorType
  range: number
  footprint: Footprint
  population: number
  trait: string
  levels: UnitLevelStats[]
  recruitment?: {
    gold: number
    crystal: number
  }
}

export interface SpellTemplate {
  id: string
  name: string
  category: 'melee' | 'directional' | 'targetable' | 'healing'
  baseValue: number
  cooldownSeconds: number
}

export interface BuildingTemplate {
  id: string
  name: string
  category: string
  size: Footprint
  upgrade?: {
    maxLevel: number
    baseGold: number
    baseCrystal: number
    baseDurationMinutes: number
  }
  economy?: {
    resourceId?: ResourceId
    ratePerHour?: number
    capacity?: number
    populationBonus?: number
  }
}

export interface FormationPlacement {
  unitId: string
  row: number
  col: number
  level: number
}

export interface ArmySnapshot {
  placements: FormationPlacement[]
}

export interface BattleCommand {
  tick: number
  side: Side
  spellId: string
  targetEntityId?: string
}

export interface BattleInput {
  seed: number
  maxTicks: number
  attacker: ArmySnapshot
  defender: ArmySnapshot
  commands?: BattleCommand[]
}

export interface BattleEvent {
  tick: number
  type: 'move' | 'attack' | 'heal' | 'buff' | 'death' | 'spell'
  sourceId?: string
  targetId?: string
  value?: number
  note?: string
}

export interface BattleResult {
  winner: Side | 'draw'
  endTick: number
  events: BattleEvent[]
  summary: {
    attackerLosses: number
    defenderLosses: number
    totalDamageBySide: Record<Side, number>
  }
}

export interface TutorialLevel {
  id: string
  name: string
  description: string
  defender: ArmySnapshot
  rewards: Record<ResourceId, number>
}

export interface TaskTemplate {
  id: string
  name: string
  description: string
  category: 'recruit' | 'daily' | 'pve' | 'resource'
  eventId: string
  scope: 'lifetime' | 'daily'
  goal: number
  rewards: {
    gold: number
    crystal: number
    xp: number
  }
}

export interface GameContent {
  battlefield: {
    rows: number
    columns: number
    sideADeployEnd: number
    sideBDeployStart: number
  }
  units: UnitTemplate[]
  buildings: BuildingTemplate[]
  spells: SpellTemplate[]
  tutorialLevels: TutorialLevel[]
  tasks: TaskTemplate[]
}

export interface BuildingSaveState {
  lastCollectedAt: string
  row: number
  col: number
  level: number
  upgradingToLevel?: number
  upgradeCompleteAt?: string
}

export interface SaveGame {
  schemaVersion: number
  contentVersion: string
  wallets: Record<ResourceId, number>
  buildings: Record<string, BuildingSaveState>
  roster: Record<string, number>
  playerLevel: number
  xp: number
  activeLevelId: string
  activeSpellId: string
  completedLevelIds: string[]
  formation: FormationPlacement[]
  taskEvents: Record<string, number>
  dailyTaskEvents: Record<string, number>
  dailyTaskDate: string
  claimedTaskKeys: string[]
}
