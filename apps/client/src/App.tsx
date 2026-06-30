import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import './App.css'
import { buildingById, gameContent, spellById, unitById } from '@content/gameContent'
import { getArmyPopulation, simulateBattle, validateArmy } from '@sim/battle'
import type {
  BattleResult,
  BuildingSaveState,
  FormationPlacement,
  ResourceId,
  SaveGame,
  TaskTemplate,
  UnitTemplate,
} from '@shared/game'

const saveKey = 'little-empire-save-v1'
const saveSchemaVersion = 2
const contentVersion = 'mvp-0.4.0'
const maxImportSizeBytes = 256 * 1024
const todayKey = () => new Date().toISOString().slice(0, 10)
const cityRows = 16
const cityColumns = 16

type DragState =
  | { type: 'building'; buildingId: string }
  | { type: 'roster-unit'; unitId: string }
  | { type: 'placed-unit'; placementIndex: number; unitId: string }

interface ReplayEntityState {
  entityId: string
  unitId: string
  name: string
  side: 'A' | 'B'
  row: number
  col: number
  width: number
  height: number
  hp: number
  maxHp: number
  alive: boolean
}

interface ReplayFx {
  id: string
  x: number
  y: number
  label: string
  tone: 'damage' | 'heal' | 'spell' | 'buff'
}

const initialBuildingLayout: Record<string, Pick<BuildingSaveState, 'row' | 'col'>> = {
  castle: { row: 3, col: 3 },
  house: { row: 0, col: 0 },
  gold_mine: { row: 0, col: 3 },
  crystal_mine: { row: 0, col: 8 },
  barracks: { row: 11, col: 0 },
  shooting_range: { row: 11, col: 5 },
  warehouse: { row: 11, col: 10 },
}

const createInitialSave = (): SaveGame => ({
  schemaVersion: saveSchemaVersion,
  contentVersion,
  wallets: {
    gold: 2200,
    crystal: 700,
  },
  buildings: {
    castle: { lastCollectedAt: new Date().toISOString(), ...initialBuildingLayout.castle },
    house: { lastCollectedAt: new Date().toISOString(), ...initialBuildingLayout.house },
    gold_mine: { lastCollectedAt: new Date(Date.now() - 1000 * 60 * 70).toISOString(), ...initialBuildingLayout.gold_mine },
    crystal_mine: { lastCollectedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(), ...initialBuildingLayout.crystal_mine },
    barracks: { lastCollectedAt: new Date().toISOString(), ...initialBuildingLayout.barracks },
    shooting_range: { lastCollectedAt: new Date().toISOString(), ...initialBuildingLayout.shooting_range },
    warehouse: { lastCollectedAt: new Date().toISOString(), ...initialBuildingLayout.warehouse },
  },
  roster: {
    behemoth: 1,
    succubus: 0,
    berserker: 0,
    footman: 2,
    troll: 1,
    archer: 2,
    ninja: 0,
    priest: 1,
    mage: 0,
    knight: 0,
    wolf_rider: 0,
    shaman: 0,
    archangel: 0,
    iron_wheel: 0,
    troll_cyborg: 0,
  },
  playerLevel: 1,
  xp: 0,
  activeLevelId: 'tutorial-1',
  activeSpellId: 'fire_blast',
  completedLevelIds: [],
  taskEvents: {},
  dailyTaskEvents: {},
  dailyTaskDate: todayKey(),
  claimedTaskKeys: [],
  formation: [
    { unitId: 'behemoth', row: 2, col: 1, level: 1 },
    { unitId: 'footman', row: 1, col: 3, level: 1 },
    { unitId: 'footman', row: 4, col: 3, level: 1 },
    { unitId: 'archer', row: 1, col: 5, level: 1 },
    { unitId: 'archer', row: 4, col: 5, level: 1 },
    { unitId: 'priest', row: 3, col: 4, level: 1 },
  ],
})

const initialSave = createInitialSave()

const defaultRoster = initialSave.roster

const levelUpFromXp = (level: number, xp: number) => {
  let nextLevel = level
  let nextXp = xp

  while (nextXp >= xpToNextLevel(nextLevel)) {
    nextXp -= xpToNextLevel(nextLevel)
    nextLevel += 1
  }

  return { level: nextLevel, xp: nextXp }
}

const withTaskEvent = (save: SaveGame, eventId: string, amount = 1): SaveGame => {
  const nextDailyTaskDate = save.dailyTaskDate === todayKey() ? save.dailyTaskDate : todayKey()
  const nextDailyTaskEvents = nextDailyTaskDate === save.dailyTaskDate ? save.dailyTaskEvents : {}

  return {
    ...save,
    taskEvents: {
      ...save.taskEvents,
      [eventId]: (save.taskEvents[eventId] ?? 0) + amount,
    },
    dailyTaskDate: nextDailyTaskDate,
    dailyTaskEvents: {
      ...nextDailyTaskEvents,
      [eventId]: (nextDailyTaskEvents[eventId] ?? 0) + amount,
    },
  }
}

const getTaskClaimKey = (task: TaskTemplate, save: SaveGame) =>
  task.scope === 'daily' ? `${task.id}:${save.dailyTaskDate}` : task.id

const getTaskProgress = (task: TaskTemplate, save: SaveGame) =>
  task.scope === 'daily' ? save.dailyTaskEvents[task.eventId] ?? 0 : save.taskEvents[task.eventId] ?? 0

const normalizeBuildings = (buildings: Partial<SaveGame['buildings']> | null | undefined) =>
  Object.fromEntries(
    Object.entries(initialSave.buildings).map(([buildingId, state]) => [
      buildingId,
      {
        ...state,
        ...(buildings?.[buildingId] ?? {}),
      },
    ]),
  ) as SaveGame['buildings']

const normalizeSave = (save: Partial<SaveGame> | null | undefined): SaveGame => ({
  schemaVersion: saveSchemaVersion,
  contentVersion,
  wallets: {
    ...initialSave.wallets,
    ...save?.wallets,
  },
  buildings: normalizeBuildings(save?.buildings),
  roster: {
    ...defaultRoster,
    ...save?.roster,
  },
  playerLevel: save?.playerLevel ?? 1,
  xp: save?.xp ?? 0,
  activeLevelId: save?.activeLevelId ?? initialSave.activeLevelId,
  activeSpellId: save?.activeSpellId ?? initialSave.activeSpellId,
  completedLevelIds: save?.completedLevelIds ?? [],
  formation: save?.formation ?? initialSave.formation,
  taskEvents: save?.taskEvents ?? {},
  dailyTaskEvents: save?.dailyTaskEvents ?? {},
  dailyTaskDate: save?.dailyTaskDate ?? todayKey(),
  claimedTaskKeys: save?.claimedTaskKeys ?? [],
})

const parseImportedSave = (raw: string): SaveGame => {
  if (new Blob([raw]).size > maxImportSizeBytes) {
    throw new Error('导入失败：存档文件过大。')
  }

  const parsed = JSON.parse(raw)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('导入失败：存档不是有效对象。')
  }

  return refreshDailyState(normalizeSave(parsed as Partial<SaveGame>))
}

const refreshDailyState = (save: SaveGame): SaveGame => {
  const currentDay = todayKey()

  if (save.dailyTaskDate === currentDay) {
    return save
  }

  return {
    ...save,
    dailyTaskDate: currentDay,
    dailyTaskEvents: {},
  }
}

const getStoredSave = (): SaveGame => {
  const raw = localStorage.getItem(saveKey)

  if (!raw) {
    return refreshDailyState(initialSave)
  }

  try {
    return refreshDailyState(normalizeSave(JSON.parse(raw) as Partial<SaveGame>))
  } catch {
    return refreshDailyState(initialSave)
  }
}

const xpToNextLevel = (level: number) => 120 + (level - 1) * 40

const countPlacedUnits = (formation: FormationPlacement[]) => {
  const counts: Record<string, number> = {}

  for (const placement of formation) {
    counts[placement.unitId] = (counts[placement.unitId] ?? 0) + 1
  }

  return counts
}

const getUnitStats = (unitId: string, level: number) => {
  const template = unitById[unitId]
  const index = Math.max(0, Math.min(template.levels.length - 1, level - 1))

  return template.levels[index]
}

const buildReplayEntities = (formation: FormationPlacement[], defender: FormationPlacement[]) => {
  const entries: ReplayEntityState[] = []

  for (const [side, placements] of [
    ['A', formation],
    ['B', defender],
  ] as const) {
    placements.forEach((placement, index) => {
      const template = unitById[placement.unitId]
      const stats = getUnitStats(placement.unitId, placement.level)

      entries.push({
        entityId: `${side}-${placement.unitId}-${index + 1}`,
        unitId: placement.unitId,
        name: template.name,
        side,
        row: placement.row,
        col: placement.col,
        width: template.footprint.width,
        height: template.footprint.height,
        hp: stats.hp,
        maxHp: stats.hp,
        alive: true,
      })
    })
  }

  return entries
}

const getPlacementAtCell = (formation: FormationPlacement[], row: number, col: number) =>
  formation.find((item) => {
    const template = unitById[item.unitId]
    return row >= item.row && row < item.row + template.footprint.height && col >= item.col && col < item.col + template.footprint.width
  })

const canPlaceFormationUnit = (
  formation: FormationPlacement[],
  roster: SaveGame['roster'],
  unitId: string,
  row: number,
  col: number,
  movingPlacementIndex?: number,
) => {
  const nextPlacement: FormationPlacement = { unitId, row, col, level: 1 }
  const remaining = formation.filter((_, index) => index !== movingPlacementIndex)
  const placedCount = remaining.filter((placement) => placement.unitId === unitId).length
  const ownedCount = roster[unitId] ?? 0

  if (placedCount >= ownedCount && movingPlacementIndex === undefined) {
    return false
  }

  return validateArmy({ placements: [...remaining, nextPlacement] }, 'A').ok
}

const canPlaceBuilding = (buildingId: string, row: number, col: number, buildings: SaveGame['buildings']) => {
  const template = buildingById[buildingId]

  if (row < 0 || col < 0 || row + template.size.height > cityRows || col + template.size.width > cityColumns) {
    return false
  }

  return !Object.entries(buildings).some(([otherId, state]) => {
    if (otherId === buildingId) {
      return false
    }

    const other = buildingById[otherId]
    const overlapsRows = row < state.row + other.size.height && row + template.size.height > state.row
    const overlapsCols = col < state.col + other.size.width && col + template.size.width > state.col

    return overlapsRows && overlapsCols
  })
}

const getPopulationCap = () => {
  const castleBonus = buildingById.castle.economy?.populationBonus ?? 0
  const houseBonus = buildingById.house.economy?.populationBonus ?? 0

  return castleBonus + houseBonus
}

const collectableAmount = (buildingId: string, save: SaveGame) => {
  const building = buildingById[buildingId]
  const economy = building.economy

  if (!economy?.resourceId || !economy.ratePerHour || !economy.capacity) {
    return 0
  }

  const lastCollected = new Date(save.buildings[buildingId].lastCollectedAt).getTime()
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastCollected) / 1000))

  return Math.min(economy.capacity, Math.floor((economy.ratePerHour * elapsedSeconds) / 3600))
}

const getCardClassName = (selected: boolean) => `card${selected ? ' selected' : ''}`

function App() {
  const [save, setSave] = useState<SaveGame>(() => getStoredSave())
  const [selectedUnitId, setSelectedUnitId] = useState('footman')
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null)
  const [error, setError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoveredCityCell, setHoveredCityCell] = useState<{ row: number; col: number } | null>(null)
  const [hoveredBattleCell, setHoveredBattleCell] = useState<{ row: number; col: number } | null>(null)
  const [replayEntities, setReplayEntities] = useState<ReplayEntityState[]>([])
  const [replayTick, setReplayTick] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [replayHighlights, setReplayHighlights] = useState<{ attackers: string[]; targets: string[] }>({ attackers: [], targets: [] })
  const [replayEffects, setReplayEffects] = useState<ReplayFx[]>([])
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    localStorage.setItem(saveKey, JSON.stringify(save))
  }, [save])

  const tutorialLevel = useMemo(
    () => gameContent.tutorialLevels.find((level) => level.id === save.activeLevelId) ?? gameContent.tutorialLevels[0],
    [save.activeLevelId],
  )
  const activeLevelIndex = useMemo(
    () => gameContent.tutorialLevels.findIndex((level) => level.id === tutorialLevel.id),
    [tutorialLevel.id],
  )
  const tasks = useMemo(
    () =>
      gameContent.tasks.map((task) => {
        const progress = Math.min(task.goal, getTaskProgress(task, save))
        const claimKey = getTaskClaimKey(task, save)
        const claimed = save.claimedTaskKeys.includes(claimKey)

        return {
          ...task,
          progress,
          claimed,
          canClaim: progress >= task.goal && !claimed,
        }
      }),
    [save],
  )

  const attackerArmy = useMemo(() => ({ placements: save.formation }), [save.formation])
  const placementCounts = useMemo(() => countPlacedUnits(save.formation), [save.formation])
  const usedPopulation = useMemo(() => getArmyPopulation(attackerArmy), [attackerArmy])
  const populationCap = getPopulationCap()
  const attackerValidation = validateArmy(attackerArmy, 'A')
  const nextLevelXp = xpToNextLevel(save.playerLevel)
  const claimableTaskCount = tasks.filter((task) => task.canClaim).length
  const replaySourcePlacements = useMemo(() => buildReplayEntities(save.formation, tutorialLevel.defender.placements), [save.formation, tutorialLevel.defender.placements])

  useEffect(() => {
    if (!battleResult) {
      return
    }

    setReplayEntities(replaySourcePlacements)
    setReplayTick(0)
    setReplayPlaying(true)
    setReplayHighlights({ attackers: [], targets: [] })
    setReplayEffects([])
  }, [battleResult, replaySourcePlacements])

  useEffect(() => {
    if (!battleResult || !replayPlaying) {
      return
    }

    if (replayTick > battleResult.endTick) {
      setReplayPlaying(false)
      return
    }

    const timer = window.setTimeout(() => {
      const tickEvents = battleResult.events.filter((event) => event.tick === replayTick)

      setReplayHighlights({
        attackers: tickEvents.map((event) => event.sourceId).filter(Boolean) as string[],
        targets: tickEvents.map((event) => event.targetId).filter(Boolean) as string[],
      })

      if (tickEvents.length > 0) {
        setReplayEntities((current) => {
          const next = current.map((entity) => ({ ...entity }))
          const nextEffects: ReplayFx[] = []

          for (const event of tickEvents) {
            const source = next.find((entity) => entity.entityId === event.sourceId)
            const target = next.find((entity) => entity.entityId === event.targetId)

            if (target && typeof event.value === 'number' && (event.type === 'attack' || event.type === 'heal' || event.type === 'spell' || event.type === 'buff')) {
              nextEffects.push({
                id: `${replayTick}-${event.type}-${event.targetId}-${event.value}`,
                x: target.col * 48 + target.width * 24 - 18,
                y: target.row * 48 + 8,
                label:
                  event.type === 'heal'
                    ? `+${event.value}`
                    : event.type === 'buff'
                      ? `ATK+${event.value}`
                      : event.type === 'spell' && event.note?.includes('治疗')
                        ? `+${event.value}`
                        : `-${event.value}`,
                tone:
                  event.type === 'heal'
                    ? 'heal'
                    : event.type === 'buff'
                      ? 'buff'
                      : event.type === 'spell'
                        ? 'spell'
                        : 'damage',
              })
            }

            if (event.type === 'move' && source) {
              source.col += source.side === 'A' ? 1 : -1
            }

            if ((event.type === 'attack' || event.type === 'spell') && target && typeof event.value === 'number') {
              if (event.type === 'spell' && event.note?.includes('治疗')) {
                target.hp = Math.min(target.maxHp, target.hp + event.value)
              } else {
                target.hp = Math.max(0, target.hp - event.value)
              }
            }

            if (event.type === 'heal' && target && typeof event.value === 'number') {
              target.hp = Math.min(target.maxHp, target.hp + event.value)
            }

            if (event.type === 'death' && target) {
              target.hp = 0
              target.alive = false
            }
          }

          setReplayEffects(nextEffects)

          return next
        })
      } else {
        setReplayEffects([])
      }

      setReplayTick((current) => current + 1)
    }, 140)

    return () => window.clearTimeout(timer)
  }, [battleResult, replayPlaying, replayTick])

  const exportSave = () => {
    const exportPayload = JSON.stringify(refreshDailyState(save), null, 2)
    const blob = new Blob([exportPayload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `little-empire-save-${todayKey()}.json`
    link.click()
    URL.revokeObjectURL(url)
    setSaveMessage('已导出当前本地存档。')
  }

  const importSave = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const imported = parseImportedSave(await file.text())
      setSave(imported)
      setBattleResult(null)
      setError('')
      setSaveMessage(`已导入存档，内容版本 ${imported.contentVersion}。`)
    } catch (importError) {
      setSaveMessage(importError instanceof Error ? importError.message : '导入失败：未知错误。')
    } finally {
      event.target.value = ''
    }
  }

  const resetSave = () => {
    const confirmed = window.confirm('确认重置本地存档？当前进度会被新的初始存档覆盖。')

    if (!confirmed) {
      return
    }

    const freshSave = refreshDailyState(createInitialSave())
    setSave(freshSave)
    setBattleResult(null)
    setError('')
    setSaveMessage('已重置为新的初始存档。')
  }

  const recruitUnit = (unit: UnitTemplate) => {
    if (!unit.recruitment) {
      return
    }

    const nextPopulation = Object.entries(save.roster).reduce((total, [unitId, count]) => {
      const template = unitById[unitId]
      return total + template.population * count
    }, 0) + unit.population

    if (nextPopulation > populationCap) {
      setError('人口上限不足，先扩建住宅或撤下高人口部队。')
      return
    }

    if (save.wallets.gold < unit.recruitment.gold || save.wallets.crystal < unit.recruitment.crystal) {
      setError('金币或水晶不足。')
      return
    }

    setError('')
    setSave((current) => ({
      ...withTaskEvent(current, 'recruit_unit'),
      wallets: {
        gold: current.wallets.gold - unit.recruitment!.gold,
        crystal: current.wallets.crystal - unit.recruitment!.crystal,
      },
      roster: {
        ...current.roster,
        [unit.id]: (current.roster[unit.id] ?? 0) + 1,
      },
    }))
  }

  const collect = (buildingId: string, resourceId: ResourceId) => {
    const amount = collectableAmount(buildingId, save)

    if (amount <= 0) {
      return
    }

    setSave((current) => ({
      ...withTaskEvent(current, 'collect_resource'),
      wallets: {
        ...current.wallets,
        [resourceId]: current.wallets[resourceId] + amount,
      },
      buildings: {
        ...current.buildings,
        [buildingId]: {
          ...current.buildings[buildingId],
          lastCollectedAt: new Date().toISOString(),
        },
      },
    }))
  }

  const claimTask = (task: TaskTemplate) => {
    setSave((current) => {
      const refreshed = refreshDailyState(current)
      const claimKey = getTaskClaimKey(task, refreshed)

      if (refreshed.claimedTaskKeys.includes(claimKey)) {
        return refreshed
      }

      if (getTaskProgress(task, refreshed) < task.goal) {
        return refreshed
      }

      const levelState = levelUpFromXp(refreshed.playerLevel, refreshed.xp + task.rewards.xp)

      return {
        ...refreshed,
        wallets: {
          gold: refreshed.wallets.gold + task.rewards.gold,
          crystal: refreshed.wallets.crystal + task.rewards.crystal,
        },
        playerLevel: levelState.level,
        xp: levelState.xp,
        claimedTaskKeys: [...refreshed.claimedTaskKeys, claimKey],
      }
    })
  }

  const removePlacement = (row: number, col: number) => {
    setSave((current) => ({
      ...current,
      formation: current.formation.filter((placement) => {
        const template = unitById[placement.unitId]
        const containsRow = row >= placement.row && row < placement.row + template.footprint.height
        const containsCol = col >= placement.col && col < placement.col + template.footprint.width

        return !(containsRow && containsCol)
      }),
    }))
  }

  const moveBuilding = (buildingId: string, row: number, col: number) => {
    if (!canPlaceBuilding(buildingId, row, col, save.buildings)) {
      setError('建筑不能放在这里：越界或与其他建筑重叠。')
      return
    }

    setError('')
    setSave((current) => ({
      ...current,
      buildings: {
        ...current.buildings,
        [buildingId]: {
          ...current.buildings[buildingId],
          row,
          col,
        },
      },
    }))
  }

  const moveExistingPlacement = (placementIndex: number, row: number, col: number) => {
    const currentPlacement = save.formation[placementIndex]

    if (!currentPlacement) {
      return
    }

    const remaining = save.formation.filter((_, index) => index !== placementIndex)
    const nextPlacement: FormationPlacement = { ...currentPlacement, row, col }
    const nextArmy = { placements: [...remaining, nextPlacement] }
    const validation = validateArmy(nextArmy, 'A')

    if (!validation.ok) {
      setError(validation.reason)
      return
    }

    setError('')
    setSave((current) => ({
      ...current,
      formation: current.formation.map((placement, index) => (index === placementIndex ? nextPlacement : placement)),
    }))
  }

  const handleBattlefieldDrop = (row: number, col: number) => {
    if (!dragState) {
      return
    }

    if (col > 6) {
      setError('只能拖放到我方部署区。')
      return
    }

    if (getPlacementAtCell(tutorialLevel.defender.placements, row, col)) {
      setError('不能拖放到敌方占用区域。')
      return
    }

    if (dragState.type === 'roster-unit') {
      if (!canPlaceFormationUnit(save.formation, save.roster, dragState.unitId, row, col)) {
        setError('该位置无法部署此单位。')
        return
      }

      setSelectedUnitId(dragState.unitId)
      placeUnit(row, col, dragState.unitId)
      return
    }

    if (dragState.type === 'placed-unit') {
      if (!canPlaceFormationUnit(save.formation, save.roster, dragState.unitId, row, col, dragState.placementIndex)) {
        setError('该位置无法移动到。')
        return
      }

      moveExistingPlacement(dragState.placementIndex, row, col)
    }
  }

  const restartReplay = () => {
    setReplayEntities(replaySourcePlacements)
    setReplayTick(0)
    setReplayPlaying(true)
    setReplayHighlights({ attackers: [], targets: [] })
    setReplayEffects([])
  }

  const placeUnit = (row: number, col: number, unitId = selectedUnitId) => {
    setError('')

    const placedCount = placementCounts[unitId] ?? 0
    const ownedCount = save.roster[unitId] ?? 0

    if (placedCount >= ownedCount) {
      setError('该单位库存不足，请先招募或移除其他已部署实例。')
      return
    }

    const nextPlacement: FormationPlacement = { unitId, row, col, level: 1 }
    const nextArmy = { placements: [...save.formation, nextPlacement] }

    if (getArmyPopulation(nextArmy) > populationCap) {
      setError('部署后会超出人口上限。')
      return
    }

    const validation = validateArmy(nextArmy, 'A')

    if (!validation.ok) {
      setError(validation.reason)
      return
    }

    setSave((current) => ({
      ...current,
      formation: [...current.formation, nextPlacement],
    }))
  }

  const runBattle = () => {
    const validation = validateArmy(attackerArmy, 'A')

    if (!validation.ok) {
      setError(validation.reason)
      return
    }

    setError('')

    const result = simulateBattle({
      seed: 42,
      maxTicks: 240,
      attacker: attackerArmy,
      defender: tutorialLevel.defender,
      commands: [{ tick: 20, side: 'A', spellId: save.activeSpellId }],
    })

    setBattleResult(result)

    if (result.winner !== 'A') {
      return
    }

    setSave((current) => {
      const nextCompletedLevelIds = current.completedLevelIds.includes(tutorialLevel.id)
        ? current.completedLevelIds
        : [...current.completedLevelIds, tutorialLevel.id]
      const nextBaseXp = current.xp + 50 + activeLevelIndex * 25
      const nextLevelState = levelUpFromXp(current.playerLevel, nextBaseXp)
      let nextRoster = current.roster

      const nextTutorialLevel = gameContent.tutorialLevels[activeLevelIndex + 1]
      if (tutorialLevel.id === 'tutorial-4') {
        nextRoster = {
          ...nextRoster,
          succubus: Math.max(nextRoster.succubus ?? 0, 1),
          berserker: Math.max(nextRoster.berserker ?? 0, 1),
        }
      }

      const progressed = withTaskEvent(current, 'win_pve')

      return {
        ...progressed,
        wallets: {
          gold: current.wallets.gold + tutorialLevel.rewards.gold,
          crystal: current.wallets.crystal + tutorialLevel.rewards.crystal,
        },
        roster: nextRoster,
        playerLevel: nextLevelState.level,
        xp: nextLevelState.xp,
        completedLevelIds: nextCompletedLevelIds,
        activeLevelId: nextTutorialLevel && !current.completedLevelIds.includes(tutorialLevel.id) ? nextTutorialLevel.id : current.activeLevelId,
      }
    })
  }

  return (
    <main className="app-shell">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">Little Empire MVP / 单机浏览器版</p>
          <h1>小小帝国：城市经营 + 阵型战斗首轮实现</h1>
          <p className="hero-copy">
            这一版继续扩到多关教学与成长反馈，首轮单机循环已经可以从收菜、招募、布阵一路推进到关卡奖励和解锁下一关。
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <span>金币</span>
            <strong>{save.wallets.gold}</strong>
          </div>
          <div>
            <span>水晶</span>
            <strong>{save.wallets.crystal}</strong>
          </div>
          <div>
            <span>人口</span>
            <strong>
              {usedPopulation}/{populationCap}
            </strong>
          </div>
          <div>
            <span>等级 / 经验</span>
            <strong>
              {save.playerLevel} / {save.xp}
            </strong>
          </div>
        </div>
      </section>

      <section className="progress-strip">
        <div>
          <span>教学进度</span>
          <strong>
            {save.completedLevelIds.length}/{gameContent.tutorialLevels.length}
          </strong>
        </div>
        <div>
          <span>下一级所需经验</span>
          <strong>{nextLevelXp}</strong>
        </div>
          <div>
            <span>当前关卡奖励</span>
            <strong>
              {tutorialLevel.rewards.gold}G / {tutorialLevel.rewards.crystal}C
            </strong>
          </div>
          <div>
            <span>可领奖任务</span>
            <strong>{claimableTaskCount}</strong>
          </div>
        </section>

      {error ? <p className="error-banner">{error}</p> : null}
      {saveMessage ? <p className="empty-state">{saveMessage}</p> : null}

      <section className="layout-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>存档与版本</h2>
            <p>支持本地 JSON 导入导出，并显示当前存档 schema 与内容版本。</p>
          </div>
          <div className="save-actions">
            <button type="button" className="action-button" onClick={exportSave}>
              导出存档
            </button>
            <button type="button" className="action-button" onClick={() => importInputRef.current?.click()}>
              导入存档
            </button>
            <button type="button" className="action-button danger-button" onClick={resetSave}>
              重置存档
            </button>
            <input ref={importInputRef} className="hidden-input" type="file" accept="application/json,.json" onChange={importSave} />
          </div>
          <div className="save-meta-grid">
            <div>
              <span>Schema</span>
              <strong>{save.schemaVersion}</strong>
            </div>
            <div>
              <span>内容版本</span>
              <strong>{save.contentVersion}</strong>
            </div>
            <div>
              <span>存档键</span>
              <strong>{saveKey}</strong>
            </div>
            <div>
              <span>导入限制</span>
              <strong>{Math.floor(maxImportSizeBytes / 1024)} KB</strong>
            </div>
          </div>
        </article>

        <article className="panel wide-panel">
          <div className="panel-header">
            <h2>城市建造网格</h2>
            <p>从下方建筑卡片拖到城市网格，可直接重排建筑布局。</p>
          </div>
          <div className="building-palette">
            {gameContent.buildings.map((building) => (
              <button
                key={building.id}
                type="button"
                className="building-chip"
                draggable
                onDragStart={() => setDragState({ type: 'building', buildingId: building.id })}
                onDragEnd={() => setDragState(null)}
              >
                <strong>{building.name}</strong>
                <small>
                  {building.size.width}x{building.size.height}
                </small>
              </button>
            ))}
          </div>
          <div className="city-grid-frame">
            <div className="city-grid">
              {Array.from({ length: cityRows }).flatMap((_, row) =>
                Array.from({ length: cityColumns }).map((__, col) => {
                  const canDropHere = dragState?.type === 'building' && canPlaceBuilding(dragState.buildingId, row, col, save.buildings)
                  const hovered = hoveredCityCell?.row === row && hoveredCityCell.col === col

                  return (
                    <button
                      key={`city-${row}-${col}`}
                      type="button"
                      className={`city-cell${hovered ? (canDropHere ? ' droppable' : dragState?.type === 'building' ? ' blocked' : '') : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault()
                        setHoveredCityCell({ row, col })
                      }}
                      onDragLeave={() => setHoveredCityCell((current) => (current?.row === row && current.col === col ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault()

                        if (dragState?.type === 'building') {
                          moveBuilding(dragState.buildingId, row, col)
                        }

                        setDragState(null)
                        setHoveredCityCell(null)
                      }}
                    />
                  )
                }),
              )}
              {Object.entries(save.buildings).map(([buildingId, state]) => {
                const building = buildingById[buildingId]

                return (
                  <button
                    key={buildingId}
                    type="button"
                    className="city-building"
                    draggable
                    onDragStart={() => setDragState({ type: 'building', buildingId })}
                    onDragEnd={() => setDragState(null)}
                    style={{
                      gridColumn: `${state.col + 1} / span ${building.size.width}`,
                      gridRow: `${state.row + 1} / span ${building.size.height}`,
                    }}
                  >
                    <strong>{building.name}</strong>
                    <small>{building.category}</small>
                  </button>
                )
              })}
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>城市资源</h2>
            <p>按绝对时间结算产出，关闭页面后回来仍可收取。</p>
          </div>
          <div className="resource-grid">
            {(['gold_mine', 'crystal_mine'] as const).map((buildingId) => {
              const building = buildingById[buildingId]
              const amount = collectableAmount(buildingId, save)
              const resourceId = building.economy?.resourceId as ResourceId

              return (
                <button key={buildingId} className="resource-card" type="button" onClick={() => collect(buildingId, resourceId)}>
                  <span>{building.name}</span>
                  <strong>{amount}</strong>
                  <small>点击收取 {resourceId === 'gold' ? '金币' : '水晶'}</small>
                </button>
              )
            })}
          </div>
          <div className="city-notes">
            <span>当前建筑</span>
            <p>城堡、住宅、兵营、射击场、仓库、金矿、水晶矿已接入基础功能。</p>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>招募与军队库存</h2>
            <p>12 个基础兵种已接入基础数值；特殊弹射、群攻和增益效果下一轮再细化。</p>
          </div>
          <div className="roster-grid">
            {gameContent.units.map((unit) => (
              <div
                key={unit.id}
                className={getCardClassName(selectedUnitId === unit.id)}
                draggable
                onDragStart={() => setDragState({ type: 'roster-unit', unitId: unit.id })}
                onDragEnd={() => setDragState(null)}
              >
                <button type="button" className="select-button" onClick={() => setSelectedUnitId(unit.id)}>
                  <span>{unit.name}</span>
                  <small>{unit.trait}</small>
                </button>
                <div className="meta-row">
                  <span>库存 {save.roster[unit.id] ?? 0}</span>
                  <span>人口 {unit.population}</span>
                </div>
                {unit.recruitment ? (
                  <button type="button" className="action-button" onClick={() => recruitUnit(unit)}>
                    招募 {unit.recruitment.gold}G / {unit.recruitment.crystal}C
                  </button>
                ) : (
                  <div className="hero-tag">初始英雄</div>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>任务面板</h2>
            <p>任务进度由行为事件实时累计。每日任务按自然日重置，不会回扫整个存档。</p>
          </div>
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.id} className={getCardClassName(task.canClaim)}>
                <div className="task-header-row">
                  <strong>{task.name}</strong>
                  <span>{task.scope === 'daily' ? '每日' : '常驻'}</span>
                </div>
                <p className="task-copy">{task.description}</p>
                <div className="meta-row">
                  <span>
                    进度 {task.progress}/{task.goal}
                  </span>
                  <span>
                    奖励 {task.rewards.gold}G / {task.rewards.crystal}C / {task.rewards.xp}XP
                  </span>
                </div>
                {task.claimed ? (
                  <div className="hero-tag">已领取</div>
                ) : (
                  <button type="button" className="action-button" disabled={!task.canClaim} onClick={() => claimTask(task)}>
                    {task.canClaim ? '领取奖励' : '未完成'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="panel wide-panel">
          <div className="panel-header">
            <h2>6x15 阵型编辑</h2>
            <p>左侧 0-6 列为我方部署区。可从库存拖拽上阵，也可拖动已部署单位调整位置。</p>
          </div>
          {!attackerValidation.ok ? <p className="warning-text">当前阵型: {attackerValidation.reason}</p> : null}
          <div className="battlefield-frame">
            <div className="battlefield-grid">
              {Array.from({ length: gameContent.battlefield.rows }).flatMap((_, row) =>
                Array.from({ length: gameContent.battlefield.columns }).map((__, col) => {
                  const placement = getPlacementAtCell(save.formation, row, col)
                  const placementIndex = placement ? save.formation.findIndex((item) => item === placement) : -1
                  const defender = getPlacementAtCell(tutorialLevel.defender.placements, row, col)
                  const isNeutral = col === 7
                  const isPlacementAnchor = placement ? placement.row === row && placement.col === col : false
                  const canDropUnit =
                    dragState?.type === 'roster-unit'
                      ? canPlaceFormationUnit(save.formation, save.roster, dragState.unitId, row, col)
                      : dragState?.type === 'placed-unit'
                        ? canPlaceFormationUnit(save.formation, save.roster, dragState.unitId, row, col, dragState.placementIndex)
                        : false
                  const hovered = hoveredBattleCell?.row === row && hoveredBattleCell.col === col

                  return (
                    <button
                      key={`${row}-${col}`}
                      type="button"
                      draggable={isPlacementAnchor}
                      className={`cell${placement ? ' attacker' : ''}${defender ? ' defender' : ''}${isNeutral ? ' neutral' : ''}${hovered ? (canDropUnit && col <= 6 && !defender ? ' drop-ok' : dragState ? ' drop-bad' : '') : ''}`}
                      onDragStart={() => {
                        if (placement && placementIndex >= 0) {
                          setDragState({ type: 'placed-unit', placementIndex, unitId: placement.unitId })
                        }
                      }}
                      onDragEnd={() => setDragState(null)}
                      onDragOver={(event) => {
                        if (col <= 6) {
                          event.preventDefault()
                          setHoveredBattleCell({ row, col })
                        }
                      }}
                      onDragLeave={() => setHoveredBattleCell((current) => (current?.row === row && current.col === col ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault()
                        handleBattlefieldDrop(row, col)
                        setDragState(null)
                        setHoveredBattleCell(null)
                      }}
                      onClick={() => {
                        if (placement) {
                          removePlacement(row, col)
                          return
                        }

                        if (!defender && col <= 6) {
                          placeUnit(row, col)
                        }
                      }}
                    >
                      <span>{placement ? unitById[placement.unitId].name[0] : defender ? unitById[defender.unitId].name[0] : ''}</span>
                    </button>
                  )
                }),
              )}
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>PvE 关卡</h2>
            <p>{tutorialLevel.description}</p>
          </div>
          <div className="level-selector">
            {gameContent.tutorialLevels.map((level, index) => {
              const unlocked = index === 0 || save.completedLevelIds.includes(gameContent.tutorialLevels[index - 1].id)
              const completed = save.completedLevelIds.includes(level.id)

              return (
                <button
                  key={level.id}
                  type="button"
                  className={save.activeLevelId === level.id ? 'spell-button selected' : 'spell-button'}
                  disabled={!unlocked}
                  onClick={() => setSave((current) => ({ ...current, activeLevelId: level.id }))}
                >
                  <span>{level.name}</span>
                  <small>{completed ? '已通关' : unlocked ? '已解锁' : '未解锁'}</small>
                </button>
              )
            })}
          </div>
          <div className="level-card">
            <strong>{tutorialLevel.name}</strong>
            <span>
              敌方阵容固定，可用于验证同种子重放。奖励 {tutorialLevel.rewards.gold}G / {tutorialLevel.rewards.crystal}C。
            </span>
          </div>
          <div className="spell-picker">
            {gameContent.spells.map((spell) => (
              <button
                key={spell.id}
                type="button"
                className={save.activeSpellId === spell.id ? 'spell-button selected' : 'spell-button'}
                onClick={() => setSave((current) => ({ ...current, activeSpellId: spell.id }))}
              >
                <span>{spell.name}</span>
                <small>{spellById[spell.id].baseValue}</small>
              </button>
            ))}
          </div>
          <button type="button" className="battle-button" onClick={runBattle}>
            开始战斗
          </button>
        </article>

        <article className="panel">
          <div className="panel-header">
            <h2>战斗结果</h2>
            <p>固定步长为 100ms，首个法术会在第 20 tick 自动释放。</p>
          </div>
          {battleResult ? (
            <>
              <div className="result-summary">
                <div>
                  <span>胜负</span>
                  <strong>{battleResult.winner === 'A' ? '胜利' : battleResult.winner === 'B' ? '失败' : '平局'}</strong>
                </div>
                <div>
                  <span>结束 Tick</span>
                  <strong>{battleResult.endTick}</strong>
                </div>
                <div>
                  <span>伤亡</span>
                  <strong>
                    {battleResult.summary.attackerLosses}/{battleResult.summary.defenderLosses}
                  </strong>
                </div>
                <div>
                  <span>奖励</span>
                  <strong>
                    {battleResult.winner === 'A' ? `${tutorialLevel.rewards.gold}G / ${tutorialLevel.rewards.crystal}C` : '0'}
                  </strong>
                </div>
              </div>
              <div className="log-list">
                {battleResult.events.slice(0, 18).map((event, index) => (
                  <div key={`${event.tick}-${index}`} className="log-item">
                    <span>T{event.tick}</span>
                    <p>
                      {event.note ?? `${event.sourceId ?? 'system'} -> ${event.targetId ?? '-'} (${event.value ?? 0})`}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-state">还没有战报。先完成部署，然后开始第一场教学战。</p>
          )}
        </article>

        <article className="panel wide-panel">
          <div className="panel-header">
            <h2>战斗回放</h2>
            <p>按事件重放推进、攻击、治疗与死亡，便于观察阵型和特效触发。</p>
          </div>
          {battleResult ? (
            <>
              <div className="replay-toolbar">
                <button type="button" className="action-button" onClick={() => setReplayPlaying((current) => !current)}>
                  {replayPlaying ? '暂停' : '继续'}
                </button>
                <button type="button" className="action-button" onClick={restartReplay}>
                  重新播放
                </button>
                <div className="replay-tick">Tick {Math.min(replayTick, battleResult.endTick)}</div>
              </div>
              <div className="replay-field">
                <div className="battlefield-grid replay-grid-base">
                  {Array.from({ length: gameContent.battlefield.rows * gameContent.battlefield.columns }).map((_, index) => {
                    const col = index % gameContent.battlefield.columns

                    return <div key={`replay-${index}`} className={`cell replay-cell${col === 7 ? ' neutral' : ''}`} />
                  })}
                </div>
                <div className="replay-overlay">
                  {replayEntities.map((entity) => (
                    <div
                      key={entity.entityId}
                      className={`replay-unit side-${entity.side.toLowerCase()}${entity.alive ? '' : ' dead'}${replayHighlights.attackers.includes(entity.entityId) ? ' acting' : ''}${replayHighlights.targets.includes(entity.entityId) ? ' impacted' : ''}`}
                      style={{
                        width: `${entity.width * 48 - 4}px`,
                        height: `${entity.height * 48 - 4}px`,
                        transform: `translate(${entity.col * 48}px, ${entity.row * 48}px)`,
                      }}
                    >
                      <span>{entity.name}</span>
                      <small>
                        {Math.max(0, entity.hp)}/{entity.maxHp}
                      </small>
                      <div className="hp-bar">
                        <div style={{ width: `${Math.max(0, (entity.hp / entity.maxHp) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                  {replayEffects.map((effect) => (
                    <div key={effect.id} className={`replay-fx ${effect.tone}`} style={{ transform: `translate(${effect.x}px, ${effect.y}px)` }}>
                      {effect.label}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="empty-state">开始一场战斗后，这里会自动播放部队推进和交战动画。</p>
          )}
        </article>
      </section>
    </main>
  )
}

export default App
