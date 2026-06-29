import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { buildingById, gameContent, spellById, unitById } from '@content/gameContent'
import { getArmyPopulation, simulateBattle, validateArmy } from '@sim/battle'
import type {
  BattleResult,
  FormationPlacement,
  ResourceId,
  SaveGame,
  UnitTemplate,
} from '@shared/game'

const saveKey = 'little-empire-save-v1'

const initialSave: SaveGame = {
  wallets: {
    gold: 2200,
    crystal: 700,
  },
  buildings: {
    castle: { lastCollectedAt: new Date().toISOString() },
    house: { lastCollectedAt: new Date().toISOString() },
    gold_mine: { lastCollectedAt: new Date(Date.now() - 1000 * 60 * 70).toISOString() },
    crystal_mine: { lastCollectedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
    barracks: { lastCollectedAt: new Date().toISOString() },
    shooting_range: { lastCollectedAt: new Date().toISOString() },
    warehouse: { lastCollectedAt: new Date().toISOString() },
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
  formation: [
    { unitId: 'behemoth', row: 2, col: 1, level: 1 },
    { unitId: 'footman', row: 1, col: 3, level: 1 },
    { unitId: 'footman', row: 4, col: 3, level: 1 },
    { unitId: 'archer', row: 1, col: 5, level: 1 },
    { unitId: 'archer', row: 4, col: 5, level: 1 },
    { unitId: 'priest', row: 3, col: 4, level: 1 },
  ],
}

const defaultRoster = initialSave.roster

const normalizeSave = (save: Partial<SaveGame> | null | undefined): SaveGame => ({
  wallets: {
    ...initialSave.wallets,
    ...save?.wallets,
  },
  buildings: {
    ...initialSave.buildings,
    ...save?.buildings,
  },
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
})

const getStoredSave = (): SaveGame => {
  const raw = localStorage.getItem(saveKey)

  if (!raw) {
    return initialSave
  }

  try {
    return normalizeSave(JSON.parse(raw) as Partial<SaveGame>)
  } catch {
    return initialSave
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

  const attackerArmy = useMemo(() => ({ placements: save.formation }), [save.formation])
  const placementCounts = useMemo(() => countPlacedUnits(save.formation), [save.formation])
  const usedPopulation = useMemo(() => getArmyPopulation(attackerArmy), [attackerArmy])
  const populationCap = getPopulationCap()
  const attackerValidation = validateArmy(attackerArmy, 'A')
  const nextLevelXp = xpToNextLevel(save.playerLevel)

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
      ...current,
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
      ...current,
      wallets: {
        ...current.wallets,
        [resourceId]: current.wallets[resourceId] + amount,
      },
      buildings: {
        ...current.buildings,
        [buildingId]: {
          lastCollectedAt: new Date().toISOString(),
        },
      },
    }))
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

  const placeUnit = (row: number, col: number) => {
    setError('')

    const placedCount = placementCounts[selectedUnitId] ?? 0
    const ownedCount = save.roster[selectedUnitId] ?? 0

    if (placedCount >= ownedCount) {
      setError('该单位库存不足，请先招募或移除其他已部署实例。')
      return
    }

    const nextPlacement: FormationPlacement = { unitId: selectedUnitId, row, col, level: 1 }
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
      let nextXp = current.xp + 50 + activeLevelIndex * 25
      let nextPlayerLevel = current.playerLevel
      let nextRoster = current.roster

      while (nextXp >= xpToNextLevel(nextPlayerLevel)) {
        nextXp -= xpToNextLevel(nextPlayerLevel)
        nextPlayerLevel += 1
      }

      const nextTutorialLevel = gameContent.tutorialLevels[activeLevelIndex + 1]
      if (tutorialLevel.id === 'tutorial-4') {
        nextRoster = {
          ...nextRoster,
          succubus: Math.max(nextRoster.succubus ?? 0, 1),
          berserker: Math.max(nextRoster.berserker ?? 0, 1),
        }
      }

      return {
        ...current,
        wallets: {
          gold: current.wallets.gold + tutorialLevel.rewards.gold,
          crystal: current.wallets.crystal + tutorialLevel.rewards.crystal,
        },
        roster: nextRoster,
        playerLevel: nextPlayerLevel,
        xp: nextXp,
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
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="layout-grid">
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
              <div key={unit.id} className={getCardClassName(selectedUnitId === unit.id)}>
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

        <article className="panel wide-panel">
          <div className="panel-header">
            <h2>6x15 阵型编辑</h2>
            <p>左侧 0-6 列为我方部署区。点击空格放置当前选中单位，点击已占用格子移除单位。</p>
          </div>
          {!attackerValidation.ok ? <p className="warning-text">当前阵型: {attackerValidation.reason}</p> : null}
          <div className="battlefield-frame">
            <div className="battlefield-grid">
              {Array.from({ length: gameContent.battlefield.rows }).flatMap((_, row) =>
                Array.from({ length: gameContent.battlefield.columns }).map((__, col) => {
                  const placement = save.formation.find((item) => {
                    const template = unitById[item.unitId]
                    return row >= item.row && row < item.row + template.footprint.height && col >= item.col && col < item.col + template.footprint.width
                  })
                  const defender = tutorialLevel.defender.placements.find((item) => {
                    const template = unitById[item.unitId]
                    return row >= item.row && row < item.row + template.footprint.height && col >= item.col && col < item.col + template.footprint.width
                  })
                  const isNeutral = col === 7

                  return (
                    <button
                      key={`${row}-${col}`}
                      type="button"
                      className={`cell${placement ? ' attacker' : ''}${defender ? ' defender' : ''}${isNeutral ? ' neutral' : ''}`}
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
      </section>
    </main>
  )
}

export default App
