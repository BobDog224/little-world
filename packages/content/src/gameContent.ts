import type {
  BuildingTemplate,
  GameContent,
  SpellTemplate,
  UnitLevelStats,
  UnitTemplate,
} from '../../shared/src/game'

const interpolateLevels = (
  hp1: number,
  hp6: number,
  attack1: number,
  attack6: number,
  armor: number,
  attackIntervalTicks: number,
  moveIntervalTicks: number,
): UnitLevelStats[] =>
  Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5

    return {
      hp: Math.round(hp1 + (hp6 - hp1) * ratio),
      attack: Math.round(attack1 + (attack6 - attack1) * ratio),
      armor,
      attackIntervalTicks,
      moveIntervalTicks,
    }
  })

const heroes: UnitTemplate[] = [
  {
    id: 'behemoth',
    name: '巨兽',
    kind: 'hero',
    attackType: 'hero',
    armorType: 'hero',
    range: 1,
    footprint: { width: 2, height: 2 },
    population: 0,
    trait: '前排控制，近战高生存。',
    levels: [
      {
        hp: 580,
        attack: 12,
        armor: 3,
        attackIntervalTicks: 8,
        moveIntervalTicks: 5,
      },
    ],
  },
  {
    id: 'succubus',
    name: '魅魔',
    kind: 'hero',
    attackType: 'hero',
    armorType: 'hero',
    range: 7,
    footprint: { width: 2, height: 2 },
    population: 0,
    trait: '远程爆发，适合压低后排血线。',
    levels: [
      {
        hp: 260,
        attack: 9,
        armor: 1,
        attackIntervalTicks: 7,
        moveIntervalTicks: 5,
      },
    ],
  },
  {
    id: 'berserker',
    name: '狂战士',
    kind: 'hero',
    attackType: 'hero',
    armorType: 'hero',
    range: 2,
    footprint: { width: 2, height: 2 },
    population: 0,
    trait: '中前排推进，输出和机动更均衡。',
    levels: [
      {
        hp: 480,
        attack: 14,
        armor: 2,
        attackIntervalTicks: 7,
        moveIntervalTicks: 4,
      },
    ],
  },
]

const units: UnitTemplate[] = [
  {
    id: 'footman',
    name: '步兵',
    kind: 'unit',
    attackType: 'normal',
    armorType: 'light',
    range: 1,
    footprint: { width: 1, height: 1 },
    population: 1,
    trait: '基础近战。',
    recruitment: { gold: 80, crystal: 0 },
    levels: interpolateLevels(290, 435, 14, 22, 3, 8, 5),
  },
  {
    id: 'troll',
    name: '巨魔',
    kind: 'unit',
    attackType: 'piercing',
    armorType: 'cloth',
    range: 2,
    footprint: { width: 1, height: 1 },
    population: 1,
    trait: '短距离穿刺。',
    recruitment: { gold: 90, crystal: 20 },
    levels: interpolateLevels(220, 330, 16, 24, 1, 8, 5),
  },
  {
    id: 'archer',
    name: '弓箭手',
    kind: 'unit',
    attackType: 'piercing',
    armorType: 'cloth',
    range: 5,
    footprint: { width: 1, height: 1 },
    population: 1,
    trait: '基础远程。',
    recruitment: { gold: 200, crystal: 50 },
    levels: interpolateLevels(190, 285, 10, 20, 1, 8, 5),
  },
  {
    id: 'ninja',
    name: '忍者',
    kind: 'unit',
    attackType: 'normal',
    armorType: 'light',
    range: 4,
    footprint: { width: 1, height: 1 },
    population: 1,
    trait: '中程刺杀。',
    recruitment: { gold: 300, crystal: 60 },
    levels: interpolateLevels(210, 315, 8, 16, 1, 7, 4),
  },
  {
    id: 'priest',
    name: '牧师',
    kind: 'unit',
    attackType: 'heal',
    armorType: 'cloth',
    range: 3,
    footprint: { width: 1, height: 1 },
    population: 1,
    trait: '优先治疗残血友军。',
    recruitment: { gold: 100, crystal: 150 },
    levels: interpolateLevels(180, 270, 15, 20, 1, 9, 5),
  },
  {
    id: 'mage',
    name: '法师',
    kind: 'unit',
    attackType: 'magic',
    armorType: 'cloth',
    range: 4,
    footprint: { width: 1, height: 1 },
    population: 2,
    trait: '高额魔法伤害。',
    recruitment: { gold: 400, crystal: 300 },
    levels: interpolateLevels(300, 450, 15, 23, 2, 8, 5),
  },
  {
    id: 'knight',
    name: '骑士',
    kind: 'unit',
    attackType: 'normal',
    armorType: 'heavy',
    range: 1,
    footprint: { width: 2, height: 1 },
    population: 3,
    trait: '高护甲重骑。',
    recruitment: { gold: 700, crystal: 120 },
    levels: interpolateLevels(520, 750, 25, 34, 4, 8, 5),
  },
]

const spells: SpellTemplate[] = [
  {
    id: 'shattering_strike',
    name: '破碎打击',
    category: 'targetable',
    baseValue: 10,
    cooldownSeconds: 13,
  },
  {
    id: 'fire_blast',
    name: '烈焰冲击',
    category: 'directional',
    baseValue: 12,
    cooldownSeconds: 15,
  },
  {
    id: 'holy_light',
    name: '圣光',
    category: 'healing',
    baseValue: 100,
    cooldownSeconds: 15,
  },
]

const buildings: BuildingTemplate[] = [
  {
    id: 'castle',
    name: '城堡',
    category: 'default',
    size: { width: 9, height: 9 },
    economy: { populationBonus: 10 },
  },
  {
    id: 'house',
    name: '住宅',
    category: 'economy',
    size: { width: 3, height: 3 },
    economy: { populationBonus: 10 },
  },
  {
    id: 'gold_mine',
    name: '金矿',
    category: 'economy',
    size: { width: 5, height: 5 },
    economy: { resourceId: 'gold', ratePerHour: 330, capacity: 1500 },
  },
  {
    id: 'crystal_mine',
    name: '水晶矿',
    category: 'economy',
    size: { width: 5, height: 5 },
    economy: { resourceId: 'crystal', ratePerHour: 66, capacity: 400 },
  },
  {
    id: 'warehouse',
    name: '仓库',
    category: 'economy',
    size: { width: 5, height: 5 },
  },
  {
    id: 'barracks',
    name: '兵营',
    category: 'military',
    size: { width: 5, height: 5 },
  },
  {
    id: 'shooting_range',
    name: '射击场',
    category: 'military',
    size: { width: 5, height: 5 },
  },
]

export const gameContent: GameContent = {
  battlefield: {
    rows: 6,
    columns: 15,
    sideADeployEnd: 6,
    sideBDeployStart: 8,
  },
  units: [...heroes, ...units],
  buildings,
  spells,
  tutorialLevels: [
    {
      id: 'tutorial-1',
      name: '教学 1: 城门前哨',
      description: '敌方由步兵和弓箭手组成，适合验证前排顶住后排输出。',
      defender: {
        placements: [
          { unitId: 'behemoth', row: 2, col: 12, level: 1 },
          { unitId: 'footman', row: 1, col: 10, level: 2 },
          { unitId: 'footman', row: 4, col: 10, level: 2 },
          { unitId: 'archer', row: 1, col: 13, level: 2 },
          { unitId: 'archer', row: 4, col: 13, level: 2 },
          { unitId: 'priest', row: 3, col: 11, level: 1 },
        ],
      },
    },
  ],
}

export const unitById = Object.fromEntries(gameContent.units.map((unit) => [unit.id, unit]))
export const spellById = Object.fromEntries(gameContent.spells.map((spell) => [spell.id, spell]))
export const buildingById = Object.fromEntries(gameContent.buildings.map((building) => [building.id, building]))
