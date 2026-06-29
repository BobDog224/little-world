# 《小小帝国》公开资料复原与 GPT 实现设计文档

> **版本：** 0.9  
> **日期：** 2026-06-30  
> **状态：** 公开资料复原版（非原服务器数据导出）  
> **目标读者：** GPT / Codex / Claude Code / 人类程序员

## 0. 使用说明与结论先行

本文件不是《小小帝国》原服务器的数据库导出，也不声称恢复了全部内部公式、活动配置、掉落表或付费参数。原作已经停止运营，公开资料存在版本差异、页面缺失和玩家 Wiki 误差。因此，本文件采用“公开资料 clean-room 复原”方法：

- `official_verified`：官方页面或官方停服公告可以直接确认。
- `community_verified`：多个公开攻略/Wiki 条目一致，适合做默认值。
- `partial`：只恢复了部分字段，缺失项必须保留为 `null/unknown`。
- `implementation_decision`：为让项目可运行而作出的现代工程决策，不冒充原作数据。
- `implementation_assumption`：合理但无法从公开资料完全验证的规则，必须配置化并写测试。

**最重要的交付边界：** 先做“玩法机制相近、数据驱动、可重复战斗、可保存的单机浏览器 MVP”，再逐步增加账号、PvP、联盟和大型活动。不要让 GPT 一次性生成完整商业 MMO。

## 1. 原作画像与生命周期

- 英文名：Little Empire；中文常称《小小帝国》。
- 开发商：Camel Games。
- 原 Android 包名：`com.camelgames.fantasyland`。
- 玩法定位：3D 策略 RPG；玩家经营城市、生产资源、招募军队、培养英雄，编排阵型后进行自动推进战斗，并在战斗中手动释放英雄法术。
- 公开宣传的基础内容包括 3 名英雄、12 类基础兵种、近百种功能/装饰建筑、冒险、玩家竞技、联盟与城堡防守；后期资料扩展到至少 16 个玩家兵种和多个中后期系统。
- 可查到的 Android 归档版本为 1.26.4，更新时间 2020-04-07，安装包约 61.7 MB，最低 Android 4.0.3+。
- 官方于 2022-12-29 发布停服公告，并在 2023-05-08 11:00 UTC 关闭服务与服务器，账号数据随后清理。

## 2. 设计目标

### 2.1 产品目标

1. 保留原作最有辨识度的“城市经营 + 6×15 横向阵列战斗 + 三英雄 + 手动法术”体验。
2. 所有英雄、兵种、建筑、法术、科技和关卡都使用 JSON/表格驱动。
3. 战斗结果可复现：相同输入、相同随机种子必须产生相同结果和回放。
4. 离线 MVP 可在浏览器直接运行；在线阶段由权威服务器校验战斗与经济。
5. 不复制原作代码、服务器协议、商标、Logo、角色立绘、音频或地图素材。商业化前必须改名并使用原创资产，除非获得授权。

### 2.2 非目标

- 第一阶段不做完整 MMO。
- 第一阶段不做联盟海战、实时团队战场、付费商城、广告或复杂活动运营。
- 不虚构无法验证的完整掉落率、VIP、活动轮换和原版后端接口。
- 不要求像素级复制原 UI；只复刻信息架构与操作节奏。

## 3. 核心循环

```text
收取金币/水晶
  -> 建造与升级城市
  -> 增加人口、解锁招募设施
  -> 招募/升级/进化兵种
  -> 培养英雄、法术、装备、科技
  -> 编辑 6×7 己方阵型
  -> PvE/PvP 战斗（自动推进 + 手动英雄法术）
  -> 获得资源、经验、材料与装备
  -> 回到城市继续成长
```

### 3.1 短循环（2~5 分钟）

收取资源、完成一个任务、调整阵型、打一场冒险、升级一个单位或法术。

### 3.2 中循环（1~3 天）

解锁新建筑/兵种、提升人口上限、完成一个冒险章节、形成克制阵容。

### 3.3 长循环（数周）

第二英雄、科技、符文、宝石、宠物、装备进化、联盟与大型模式。

## 4. 信息架构与主要界面

### 4.1 顶层导航

- 城市：建筑、生产、收取、人口、装饰、仓库。
- 军队：招募、单位升级、编队。
- 英雄：属性、装备、法术、勋章、第二英雄。
- 冒险：章节、关卡、次数、奖励。
- 竞技：对手列表、进攻阵型、防守阵型、战报。
- 任务：主线、建设、招募、每日、PvE、PvP。
- 联盟：第二阶段后开放。
- 设置：存档、声音、语言、数据版本、调试面板。

### 4.2 城市交互

- 正交/斜 45° 视觉均可，逻辑层必须是二维整数网格。
- 建筑有 `width × height` 占格；拖动预览时显示合法/冲突状态。
- 建造、升级、产出使用绝对时间戳，重新打开时结算离线收益。
- MVP 城市网格建议 40×40；这是实现决策，不是已验证原值。
- 建筑不必旋转；若后续支持，旋转只交换宽高，不改变逻辑 ID。
- 离线收益建议最多结算 8 小时，防止经济无限膨胀；该值配置化。

## 5. 资源与经济

| ID | 中文名 | 类别 | 用途 |
| --- | --- | --- | --- |
| gold | 金币 | 基础货币 | 建筑、招募、升级、联盟等绝大多数功能 |
| crystal | 水晶 | 基础货币 | 建筑、招募、升级，与金币共同构成基础经济 |
| mojo | Mojo | 高级/稀有货币 | 法术、便捷功能、随机系统与部分高级消耗 |
| magic_spar | Magic Spar | 高级成长材料 | 法术、勋章、英雄能力、符文、科技 |
| dark_crystal | 暗水晶 | 中后期材料 | 高级系统与活动消耗 |
| element | 元素 | 法术分解材料 | 法术升级与相关系统 |
| iron_ingot | 铁锭 | 进化材料 | 兵种、装备、勋章等 |
| brass_ingot | 黄铜/铜锭 | 进化材料 | 兵种、装备、勋章等 |
| gold_ingot | 金锭 | 进化材料 | 兵种、装备、勋章等 |
| mithril_ingot | 秘银锭 | 高级进化材料 | 高级兵种、装备、勋章 |
| demonite_ingot | 魔晶锭 | 高级进化材料 | 高级兵种、装备、勋章 |
| rune_fragment | 符文碎片 | 符文材料 | 符文解锁、重铸 |
| alliance_coin | 联盟币 | 联盟材料 | 联盟建筑与联盟成长 |
| sea_stone | 海石 | 后期材料 | 高阶装备进化 |
| order_key | 秩序之钥 | 后期材料 | 高阶装备/宝箱相关 |
| pet_food_basic | 基础宠物食物 | 宠物材料 | 宠物经验 |
| pet_food_advanced | 高级宠物食物 | 宠物材料 | 更多宠物经验 |
| pet_food_deluxe | 豪华宠物食物 | 宠物材料 | 大量宠物经验 |

### 5.1 经济原则

- 金币和水晶为双基础货币。
- Mojo、Magic Spar、锭、元素、符文碎片等构成长线资源。
- 所有生产和消耗采用整数；不允许浮点货币。
- 生产公式建议：
  `produced = min(capacity - stored, floor(ratePerHour * elapsedSeconds / 3600))`
- 收取后更新 `lastCollectedAt`，不能通过修改客户端时间直接生成收益；在线模式由服务器时间裁定。
- MVP 只启用金币、水晶、Mojo、Magic Spar、Element、Iron Ingot 六种，其余保留数据结构但不进入主循环。

## 6. 建筑数据

| 中文 | 英文 | 类别 | 尺寸 | 开放等级 | 金币 | 水晶 | 功能 | 数据状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 城堡 | Castle | default | 9×9 | 1 | 未知 | 未知 | 主城、城墙耐久、等级与功能入口 | community_verified |
| 英雄祭坛 | Altar of Hero | default | 5×5 | 1 | 未知 | 未知 | 英雄相关入口 | community_verified |
| 赌场 | Casino | default | 5×5 | 1 | 未知 | 未知 | 抽奖/随机奖励 | community_verified |
| 住宅 | House | economy | 3×3 | 1 | 500 | 200 | 增加人口；后期资料显示 1 级约 +10，早期攻略曾写 +5 | community_verified |
| 金矿 | Gold Mine | economy | 5×5 | 1 | 6000 | 800 | 1 级约 330 金币/小时 | community_verified |
| 水晶矿 | Crystal Mine | economy | 5×5 | 1 | 12000 | 0 | 1 级约 66 水晶/小时 | community_verified |
| 监狱 | Prison Cell | economy | 4×4 | 18 | 5000 | 1000 | 俘虏系统与额外收益 | community_verified |
| 仓库 | Warehouse | economy | 5×5 | 1 | 1000 | 200 | 1 级保护约 6000 金币 / 1500 水晶 | community_verified |
| 传送门 | Portal | economy | 5×5 | 未知 | 500000 | 未知 | 开启第二帝国/第二城市 | community_verified |
| 炼金实验室 | Alchemy Lab | economy | 6×6 | 未知 | 5000 | 2000 | 宝石相关 | community_verified |
| 大使馆 | Embassy | alliance | 5×5 | 未知 | 20000 | 未知 | 联盟入口 | community_verified |
| 魔晶矿 | Spar Mine | economy | 4×4 | 未知 | 0 | 0 | 约每 24 小时产 1 Magic Spar；建造价约 99 绑定 Mojo | community_verified |
| 兵营 | Barracks | military | 5×5 | 1 | 2000 | 0 | 招募步兵、巨魔 | community_verified |
| 射击场 | Shooting Range | military | 5×5 | 未知 | 3000 | 500 | 招募弓箭手、忍者 | community_verified |
| 魔法图书馆 | Magic Library | military | 未知 | 未知 | 未知 | 未知 | 招募牧师、法师 | partial |
| 马厩 | Stable | military | 未知 | 未知 | 未知 | 未知 | 招募骑士、狼骑兵 | partial |
| 魔法神殿 | Magic Temple | military | 未知 | 未知 | 未知 | 未知 | 招募萨满、大天使 | partial |
| 机械实验室 | Mech Lab | military | 未知 | 未知 | 未知 | 未知 | 招募钢铁之轮、机械巨魔 | partial |
| 熔岩堡 | Lava Keep | military | 5×5 | 未知 | 40000 | 20000 | 招募矮人投掷手、熔岩龙 | community_verified |
| 黑暗大厅 | Black Hall | military | 5×5 | 未知 | 80000 | 40000 | 招募骷髅法师、幽灵刺客 | community_verified |
| 铁匠铺 | Blacksmith | upgrade | 5×5 | 未知 | 5000 | 1000 | 近战兵种升级 | community_verified |
| 风之神殿 | Wind Shrine | upgrade | 7×7 | 未知 | 5000 | 1000 | 远程兵种升级 | community_verified |
| 魔法祭坛 | Magic Altar | upgrade | 7×7 | 未知 | 18000 | 3600 | 魔法兵种升级 | community_verified |
| 研究中心 | Research Center | upgrade | 6×6 | 15 | 未知 | 未知 | 科技研究 | partial |
| 宠物栏 | Pet Pen | upgrade | 6×6 | 45 | 未知 | 未知 | 宠物养成 | partial |
| 魔法塔 | Magic Tower | upgrade | 5×5 | 未知 | 8000 | 1500 | 魔法研究/相关成长 | community_verified |

### 6.1 建筑状态机

```text
locked -> available -> placing -> constructing -> active
active -> upgrading -> active
active -> moving -> active
active -> demolished
```

每个状态必须定义允许的操作。`constructing/upgrading` 期间可暂停生产；是否允许移动必须由配置决定。

## 7. 英雄系统

| 英雄 | 英文 | 定位 | HP | 攻击 | 护甲 | 射程 | 占格 | 能力 | 勋章 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 巨兽 | Behemoth | 前排坦克/控制 | 580 | 12 | 3 | 1 | 2×2 | Fury Slash：攻击时概率触发，对前方目标造成伤害并眩晕；动画期间存在短暂规避/无敌描述。 | Earth Medal：每级约 +60 HP、+2% 抵抗（个别页面曾出现 1.2% 的冲突值，需配置化）。 |
| 魅魔 | Succubus | 后排远程爆发 | 260 | 9 | 1 | 7 | 2×2 | Magic Flash：随机触发约 4 秒暴击强化。 | Mist Medal：每级约 -3% 法术冷却、+1% 眩晕相关增益。 |
| 狂战士 | Berserker | 中前排全能输出 | 480 | 14 | 2 | 2 | 2×2 | Battle Heart：生命低于约 30% 时触发一次，短暂无敌后提升移动速度与攻击。 | Lightning Medal：每级约 +1 攻击、+1% 闪避。 |

### 7.1 英雄规则

- 初始只选 1 名英雄。
- 公开资料显示后期可通过 Fort/相关系统拥有第二名英雄，常见开放等级约 24。
- 英雄占 2×2 格，必须作为一个不可拆分实体参与部署。
- 英雄攻击类型独立为 `hero`，对常规护甲具有优势。
- 英雄法术由玩家手动释放；离线自动战斗可选“AI 自动释放”。
- 英雄属性升级至少包括生命、攻击、防御；公开资料常见单次成长为 HP +5、ATK +1、DEF +1，费用应配置化。
- 每击杀约 50 个敌人可获得 1 Honor Point 的说法来自社区资料；MVP 可先不用击杀刷点，改为关卡奖励以减少重复劳动。

## 8. 兵种完整种子表

数值格式 `Lv1/Lv6`。后 4 个兵种属于后期扩展；字段缺失处必须保留为未知。

| 中文 | 英文 | HP | 攻击/治疗 | 攻击类型 | 护甲 | 射程 | 占格 | 人口 | 成本 | 特性 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 步兵 | Footman | 290/435 | 14/22 | normal | 3/light | 1 | 1×1 | 1 | 80G + 0C | 基础近战 | community_verified |
| 巨魔 | Troll | 220/330 | 16/24 | piercing | 1/cloth | 2 | 1×1 | 1 | 90G + 20C | 短距离穿刺 | community_verified |
| 弓箭手 | Archer | 190/285 | 10/20 | piercing | 1/cloth | 5 | 1×1 | 1 | 200G + 50C | 基础远程 | community_verified |
| 忍者 | Ninja | 210/315 | 8/16 | normal | 1/light | 4 | 1×1 | 1 | 300G + 60C | 一次可攻击最多 3 个目标 | community_verified |
| 牧师 | Priest | 180/270 | 15/20 | heal | 1/cloth | 1 | 1×1 | 1 | 100G + 150C | 治疗单位；表中数值为单次治疗 | community_verified |
| 法师 | Mage | 300/450 | 15/23 | magic | 2/cloth | 4 | 1×1 | 2 | 400G + 300C | 命中附带减速 | community_verified |
| 骑士 | Knight | 520/750 | 25/34 | normal | 4/heavy | 1 | 2×1 | 3 | 700G + 120C | 重甲近战 | community_verified |
| 狼骑兵 | Wolf Rider | 420/630 | 21/29 | normal | 1/cloth | 5 | 2×1 | 3 | 500G + 300C | 大体型远程骑兵 | community_verified |
| 萨满 | Shaman | 240/300 | 20/32.5 | buff | 1/cloth | 1 | 1×1 | 1 | 120G + 250C | 给友军提供约 20%~32.5% 速度增益 | community_verified |
| 大天使 | Archangel | 700/980 | 25/34 | magic | 2/light | 5 | 2×2 | 5 | 600G + 1000C | 范围伤害 | community_verified |
| 钢铁之轮 | Iron Wheel | 520/910 | 40/57 | piercing | 2/light | 6 | 2×2 | 4 | 800G + 600C | 弹射攻击，最多跳转 3 次 | community_verified |
| 机械巨魔 | Troll Cyborg | 1700/2125 | 40/58 | piercing | 5/heavy | 1 | 2×2 | 8 | 2000G + 700C | 可同时攻击前方两个近战目标 | community_verified |
| 矮人投掷手 | Dwarven Hurler | 330/1002 | 16/49.5 | unknown | 2/heavy | 3 | 1×1 | 3 | ?G + ?C | 后期兵种；攻击类型公开页解析不完整 | partial |
| 熔岩龙 | Lava Dragon | 660/2037 | 22/64.9 | unknown | 4/light | 1 | 未知 | 5 | ?G + ?C | 后期兵种；占格公开数据缺失 | partial |
| 骷髅法师 | Skeleton Mage | 270/820 | 15/45 | magic | 2/unknown | 6 | 1×1 | 3 | ?G + ?C | 后期远程法术兵种 | partial |
| 幽灵刺客 | Ghost Assassin | 260/950 | 19.3/55.7 | piercing | 2/cloth | 4 | 1×1 | 3 | ?G + ?C | 后期高成长穿刺兵种 | partial |

### 8.1 升级与进化

- 公开资料中大量兵种存在等级/进化阶段；但完整逐级曲线未公开恢复。
- MVP 使用线性或分段曲线生成 1~6 级：
  `value(level) = round(lv1 + (lv6-lv1)*(level-1)/5)`
- 将来获取更可靠表格后，直接替换成 `levels[]`，战斗代码不得依赖线性公式。
- 进化只改变数据模板和外观，不在代码中写死某个兵种的特例。
- 招募队列支持多个批次；单位死亡后是否永久损失由模式配置。原作早期战斗存在损失与重新招募，MVP 的普通 PvE 建议使用“伤兵恢复”降低挫败。

## 9. 战场与战斗规则

### 9.1 战场

- 总尺寸：6 行 × 15 列。
- A 方部署区：第 0~6 列。
- 中立/城墙隔离列：第 7 列。
- B 方部署区：第 8~14 列。
- A 方朝右，B 方朝左。
- 单位占格支持 1×1、2×1、2×2。
- 部署时必须检查边界、重叠、人口上限、单位数量和英雄唯一性。

### 9.2 战斗阶段

```text
VALIDATE_INPUT
  -> INITIALIZE
  -> COUNTDOWN
  -> RUNNING
  -> VICTORY / DEFEAT / DRAW / TIMEOUT
  -> REWARD
  -> REPLAY_SAVED
```

### 9.3 固定步长模拟

- `tick = 100 ms`。
- 所有速度换算为“每 tick 累积进度”，达到 1 格/一次攻击阈值才执行动作。
- 不使用浏览器真实帧率驱动逻辑；渲染可 60 FPS，模拟仍按固定 tick。
- 使用带种子的 PCG32 或 xorshift；种子包含战斗 ID、双方快照版本。
- 每 tick 只允许确定性迭代顺序，例如按 `side -> row -> column -> entityId`。
- 回放保存输入快照、随机种子和关键事件，不保存每帧像素。

### 9.4 目标选择

建议默认算法：

1. 优先同一行、前进方向上距离最近且可攻击的敌人。
2. 若同一行无目标，按行差 `1, -1, 2, -2...` 搜索。
3. 距离相同时按实体 ID 稳定排序。
4. 治疗单位选择“射程内生命比例最低”的友军；相同比例按 ID。
5. 增益单位选择尚未拥有该增益且距离最近的友军。
6. 大体型单位以其前缘单元格计算距离。

目标算法必须单独测试，不能依赖数组插入顺序。

### 9.5 攻击与护甲克制

- 普通攻击 `normal` 克制轻甲 `light`，被重甲 `heavy` 抵抗。
- 穿刺攻击 `piercing` 克制布甲 `cloth`，被轻甲抵抗。
- 魔法攻击 `magic` 克制重甲，被布甲抵抗。
- 英雄攻击 `hero` 对常规护甲都具有优势。
- 公开社区公式：

```text
extraDamage   = floor((attack - armor) * 2.00)
normalDamage  = floor( attack - armor )
reducedDamage = floor((attack - armor) * 0.75)
heroDamage    = floor((heroAttack - armor) * 1.20)
vsHeroArmor   = floor((attack - heroArmor) * 0.50)
```

- 为避免负伤害，MVP 采用 `max(1, calculatedDamage)`；这是实现假设。
- 暴击、闪避、眩晕、减速、无敌、弹射、范围伤害均通过通用 Effect 系统实现。

### 9.6 通用 Effect 数据模型

```ts
type EffectKind =
  | "damage" | "heal" | "stun" | "slow" | "haste"
  | "invulnerable" | "evasion" | "crit"
  | "attackBuff" | "defenseBuff" | "summon";

interface EffectSpec {
  kind: EffectKind;
  value: number;
  durationTicks?: number;
  chancePermille?: number;
  maxStacks?: number;
  radius?: number;
  targetFilter: string[];
}
```

## 10. 法术种子表

| 中文 | 英文 | 类别 | 开放等级 | 基础值 | 冷却秒 | 升级 Mojo | 分解元素 | 目标方式 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 破碎打击 | Shattering Strike | melee | 1 | 10 | 13 | 5 | 1 | 近身范围 |
| 悲恸重击 | Sorrow Smash | melee | 9 | 40 | 13 | 90 | 18 | 近身范围 |
| 空气冲击 | Air Bash | melee | 13 | 83 | 13 | 240 | 48 | 近身范围 |
| 命运之刃 | Blade of Fate | melee | 31 | 122 | 13 | 1299 | 260 | 近身范围 |
| 烈焰冲击 | Fire Blast | directional | 3 | 12 | 15 | 20 | 4 | 方向直线 |
| 蓝焰 | Blue Flare | directional | 10 | 24 | 15 | 120 | 24 | 方向直线 |
| 秘法冲击 | Mystical Blast | directional | 21 | 117 | 15 | 600 | 120 | 方向直线 |
| 末日灾厄 | Scourge of Doom | targetable | 7 | 8 | 17 | 50 | 10 | 指定目标 |
| 蓝色爆破 | Blue Blast | targetable | 11 | 18 | 17 | 160 | 32 | 指定目标 |
| 恶魔爆破 | Demon Blast | targetable | 22 | 63 | 17 | 800 | 160 | 指定目标 |
| 破碎之光 | Shattering Light | targetable | 16 | 86 | 15 | 500 | 100 | 指定目标/区域 |
| 巫毒打击 | Voodoo Strike | voodoo | 15 | 33 | 22 | 400 | 80 | 持续/诅咒 |
| 愤怒骸骨 | Angry Bones | voodoo | 20 | 54 | 22 | 700 | 140 | 持续/诅咒 |
| 深紫 | Deep Purple | voodoo | 28 | 69 | 22 | 999 | 200 | 持续/诅咒 |
| 步兵之魂 | Footman's Spirit | summon | 5 | 未知 | 12 | 30 | 6 | 召唤 |
| 巨魔之魂 | Troll's Spirit | summon | 8 | 未知 | 12 | 70 | 14 | 召唤 |
| 弓手之魂 | Archer's Spirit | summon | 12 | 未知 | 12 | 200 | 40 | 召唤 |
| 圣光 | Holy Light | healing | 14 | 100 | 15 | 300 | 60 | 治疗 |

### 10.1 法术实现

- 法术状态：`ready -> targeting -> cast -> cooldown -> ready`。
- 法术目标验证必须在模拟层再次进行，UI 高亮只是提示。
- 方向法术用行/列和方向参数；指定目标法术用实体 ID 或单元格。
- 召唤法术必须通过合法占格搜索；无空位时释放失败且不进入冷却。
- 公开资料未完整恢复的 NFS/高级法术仅建占位数据，不进入 MVP。

## 11. 装备、勋章、符文、宝石与宠物

### 11.1 勋章

- Earth Medal：生命与抵抗。
- Mist Medal：法术冷却与眩晕相关。
- Lightning Medal：攻击与闪避。
- 勋章常见 1~10 级；逐级成本未完整恢复，采用数据表。

### 11.2 符文

- 四类：Guard、Sacred、Combat、Smart。
- 每枚最多 3 条属性。
- 属性可抛光、重铸、锁定；公开资料提到单条属性常见上限 15。
- MVP 只做“获取、装备、三条随机属性、重铸”，不做复杂每日次数限制。

### 11.3 宝石

- 公开资料显示共有 7 个宝石槽：4 件防具、1 武器、2 戒指。
- 同类宝石叠加存在递减：100%、50%、25%、12.5%……，生命类可能例外。
- 宝石 1~5 级，常见 4 个低级合成 1 个高级。
- 所有递减规则必须存于 `stackingRule`，不可写死在 UI。

### 11.4 宠物

- 开放等级约 45，需 Pet Pen。
- 巨兽：Fire Cat；魅魔：Wee Devil；狂战士：Jungle Ape。
- 常见技能节点：宠物等级 12 获得 Dizzy Thunder，15 获得 Saint's Light。
- 外观在 20/30/60 级附近变化。
- MVP 宠物只提供被动属性和一个触发技能，不做完整喂养动画。

## 12. 科技

研究中心约在玩家等级 15 开放。公开类别包括：

`gold_production`, `crystal_production`, `unit_evasion`, `movement_speed`, `recruitment_speed`, `castle_wall_strength`, `unit_health`, `normal_attack`, `piercing_attack`, `magic_attack`, `attack_speed`, `critical_chance`, `damage_resistance`

- 社区资料称普通科技前 6 级主要消耗 Magic Spar，7 级后还需要锭；具体成本未知。
- 每项科技使用独立 `levels[]`，支持百分比和固定值。
- 加成结算顺序建议：
  `base -> unit level -> evolution -> equipment -> research -> rune/gem -> alliance -> temporary effects`
- 百分比统一用万分比整数或 ppm，避免浮点误差。

## 13. 关卡、任务与成长

### 13.1 公开可恢复的开放节点

| 玩家等级 | 开放内容 |
| --- | --- |
| 1 | 基础城市、英雄、招募、冒险 |
| 6 | 玩家 PvP / 竞技相关入口 |
| 15 | 研究中心与科技 |
| 18 | 监狱/俘虏系统 |
| 24 | Fort / 第二英雄（公开资料常见值） |
| 30 | Seal 冒险线最低等级附近 |
| 45 | 宠物栏、宠物系统；批量招募功能在部分资料中也为 45 |
| 55 | Revenge 冒险线常见进入区间 55~60 |

### 13.2 冒险线

- Conquest：早期主冒险线，公开资料提到每日约 12 次。
- Seal：完成 Conquest 且等级约 30 后进入，公开资料分为 1~5、6~8 等阶段。
- Revenge：完成 Seal 后进入，常见等级区间约 55~60，包含更强敌人与恶魔化版本。
- 已知 Boss/敌人名包括 Magic Dragon Dorck、Medusa、Black Dragon Dorck 等。
- 奖励包括装备碎片、锭、宝箱/钥匙、宠物食物、符文碎片、Magic Spar、Sea Stone、Order Key。
- 原版完整关卡阵型和掉落率无法公开恢复；MVP 自建 20 关教学章节，并使用原创敌人阵型。

### 13.3 任务类型

- 招募任务
- 建设/升级任务
- 每日任务
- 冒险/PvE 任务
- PvP 任务
- 资源收取任务

奖励可包含金币、水晶、经验和少量 Mojo。任务必须由事件总线累积，不允许每次打开界面遍历全存档。

### 13.4 声望

- 社区资料称每点声望可给军队约 +1.5% HP 和攻击。
- 原版多个模式每天提供声望，后期版本上限曾达到约 40。
- 该机制会造成老玩家碾压；现代复刻建议改为赛季等级或对 PvP 使用归一化上限。

## 14. PvP、联盟与大型模式

### 14.1 PvP

- 等级约 6 开放。
- 玩家编辑进攻阵型与防守阵型。
- 在线版采用异步 PvP：服务器读取防守快照，在权威模拟器中结算。
- 匹配分由 Elo/MMR + 战力区间 + 最近对手去重组成。
- 防守快照必须包含内容版本；版本迁移后旧回放仍能运行。

### 14.2 联盟

- 社区数据：创建联盟约需 300000 金币 + 150000 水晶。
- 联盟建筑可提供生产、兵种生命、攻击等全局加成。
- 联盟捐献、建筑和权限在 MVP 之后实现。

### 14.3 海战

公开船只部分数据：

| 船只 | 人口 | 护甲 | 速度 | 成本 |
|---|---:|---:|---:|---|
| Small Ship | 600 | 3000 | 30 | 50000 金币 + 30000 水晶 |
| Frigate | 700 | 5000 | 24 | 200000 金币 + 200000 水晶 |
| Ironclad | 800 | 9000 | 20 | 未完整恢复 |

海战被描述为联盟等级 2 且建造 Dock 后开放，含主基地、副基地和魔法矿，曾在周六进行约 30 分钟。此模式属于第三阶段，不应阻塞核心 MVP。

### 14.4 Battlefield

- 实时团队模式，军队主要自动控制。
- 存在复活延迟、矿点/目标争夺和专用 Army One 阵型。
- 技术上需要房间服务器、帧同步或服务器权威状态广播。
- 第一版可改造成“多人异步积分战”，验证经济和阵容后再实时化。

## 15. MVP 范围

### 15.1 必做

- 3 名英雄。
- 原始 12 兵种；后 4 个作为可选内容包。
- 18 个已恢复的法术。
- 城市网格、20 个左右核心建筑。
- 金币/水晶生产与收取、人口、招募、升级。
- 6×15 阵型编辑器。
- 确定性战斗、伤害克制、治疗、控制、范围、弹射、召唤。
- 20 个原创 PvE 教学关卡。
- 任务、经验、等级解锁。
- 本地存档、导入/导出 JSON、数据版本迁移。
- 战斗回放与调试面板。

### 15.2 延后

- 在线账号、排行榜、异步 PvP。
- 联盟、声望、监狱、第二帝国。
- 装备、符文、宝石、宠物的完整深度。
- 海战、实时 Battlefield。
- 付费、广告、活动后台。

## 16. 推荐技术架构

### 16.1 单机 MVP

- TypeScript 5.x
- Vite
- Phaser 3：城市/战斗画面与动画
- React：面板、列表、配置、弹窗
- Zustand：客户端 UI 与存档状态
- Zod：JSON 数据与存档校验
- Vitest：逻辑单测
- Playwright：关键流程端到端测试
- IndexedDB（Dexie 可选）：本地存档
- 不依赖后端即可运行

### 16.2 在线阶段

- Node.js + Fastify 或 NestJS
- PostgreSQL：账号、城市、库存、任务、战报
- Redis：会话、匹配、限流、临时房间
- WebSocket：实时模式
- Docker Compose：本地开发
- 服务端复用同一 `packages/sim` 战斗模拟器

### 16.3 Monorepo

```text
little-empire-remake/
  apps/
    client/
    server/
  packages/
    shared/          # ID、DTO、通用类型
    content/         # JSON、schema、内容加载与迁移
    sim/             # 无 UI、无网络、确定性战斗
    save/            # 存档、迁移、校验
    test-fixtures/
  tools/
    content-validator/
    replay-viewer/
  docs/
    design.md
    data-provenance.md
```

### 16.4 依赖方向

```text
content -> shared
sim -> shared + content
save -> shared + content
client -> shared + content + sim + save
server -> shared + content + sim
```

`sim` 不得依赖 React、Phaser、DOM、Date.now()、Math.random() 或网络。

## 17. 核心 TypeScript 接口

```ts
type EntityId = string;
type ContentId = string;
type Tick = number;

interface Position {
  row: number;
  col: number;
}

interface UnitTemplate {
  id: ContentId;
  footprint: { width: number; height: number };
  population: number;
  attackType: "normal" | "piercing" | "magic" | "hero" | "heal" | "buff";
  armorType: "light" | "cloth" | "heavy" | "hero";
  range: number;
  levels: Array<{
    hp: number;
    attack: number;
    armor: number;
    attackIntervalTicks: number;
    moveIntervalTicks: number;
  }>;
  abilities: AbilitySpec[];
}

interface BattleEntity {
  entityId: EntityId;
  templateId: ContentId;
  side: "A" | "B";
  position: Position;
  hp: number;
  maxHp: number;
  cooldownTicks: number;
  statuses: StatusInstance[];
}

interface BattleInput {
  contentVersion: string;
  seed: string;
  attacker: ArmySnapshot;
  defender: ArmySnapshot;
  mode: "pve" | "async_pvp" | "replay";
  maxTicks: number;
}

interface BattleResult {
  winner: "A" | "B" | "draw";
  endTick: number;
  survivors: Survivor[];
  statistics: BattleStatistics;
  replay: ReplayEvent[];
}
```

## 18. 数据文件规范

建议文件：

```text
packages/content/data/
  heroes.json
  units.json
  spells.json
  buildings.json
  resources.json
  technologies.json
  levels/
    chapter-01.json
  localization/
    zh-CN.json
    en-US.json
```

每条内容必须带：

```json
{
  "id": "footman",
  "contentVersion": "0.9.0",
  "status": "community_verified",
  "sources": ["W2"],
  "tags": ["unit", "melee", "basic"]
}
```

### 18.1 内容验证器

启动和 CI 时检查：

- ID 唯一。
- 引用存在。
- 数值非负。
- 占格合法。
- 等级曲线单调（允许白名单例外）。
- 建筑尺寸不超过城市网格。
- 兵种人口、招募成本、设施存在。
- 法术目标类型和 Effect 兼容。
- 关卡阵型不重叠、不越界。
- 所有 `partial/unknown` 字段若被运行时使用，必须有显式 fallback。

## 19. 存档模型

```ts
interface SaveGame {
  schemaVersion: number;
  contentVersion: string;
  profile: {
    playerId: string;
    displayName: string;
    level: number;
    xp: number;
    createdAt: string;
    lastSeenAt: string;
  };
  wallets: Record<string, number>;
  city: CitySave;
  army: ArmySave;
  heroes: HeroSave[];
  inventory: InventorySave;
  quests: QuestSave[];
  progressionFlags: string[];
}
```

- 所有迁移为纯函数：`migrateV1ToV2(save): SaveV2`。
- 导入存档前做 schema 校验、大小限制和未知字段清理。
- 在线版客户端不能提交最终钱包余额，只提交操作意图。

## 20. API 草案（在线阶段）

```text
POST /auth/guest
GET  /profile
GET  /content/manifest
GET  /city
POST /city/build
POST /city/upgrade
POST /city/collect
POST /army/recruit
PUT  /formations/:slot
POST /battle/pve/start
POST /battle/pve/command
POST /battle/pve/finish
POST /pvp/search
POST /pvp/attack
GET  /battle-reports
```

- PvE 若允许客户端即时模拟，服务器至少要重放输入验证奖励。
- PvP 必须服务器权威。
- 所有经济写接口使用幂等键。
- 内容清单返回哈希，客户端内容版本不匹配时禁止结算。

## 21. 测试策略

### 21.1 单元测试

- 克制矩阵与所有伤害公式。
- 最小伤害。
- 目标选择稳定性。
- 大体型占格和移动。
- 2×2 英雄不能越界。
- 忍者三目标、钢铁之轮三次弹射、机械巨魔双目标。
- 牧师治疗、萨满增益。
- 眩晕期间不移动/不攻击。
- 无敌期间伤害为 0。
- 相同种子 1000 次运行哈希一致。
- 存档迁移与内容校验。

### 21.2 属性测试

随机生成合法阵型并验证：

- 任何实体不重叠、不越界。
- HP 永不大于 maxHP，除非明确允许护盾。
- 战斗一定在 `maxTicks` 内结束。
- 死亡实体不再行动。
- 不出现 NaN/Infinity。
- 回放重建的结果哈希等于原结果。

### 21.3 E2E

1. 新建存档。
2. 收取资源。
3. 建住宅和兵营。
4. 招募步兵、弓箭手。
5. 编辑阵型。
6. 完成第一关。
7. 获得奖励并升级英雄。
8. 刷新页面，存档仍一致。
9. 导出存档并重新导入。
10. 打开回放，结果一致。

## 22. 验收标准

- `npm install && npm run dev` 可启动。
- `npm test` 全绿。
- 浏览器无未处理异常。
- 所有运行数据来自 JSON，不在组件中写死兵种/英雄数值。
- 同一战斗输入和种子结果完全一致。
- 可视化阵型编辑器支持拖放、占格、人口、冲突提示。
- 至少实现 3 英雄、12 兵种、6 类效果、18 法术中的 8 个代表性法术。
- 可保存、加载、导入、导出。
- 无原作商标和受版权保护的素材；只使用几何占位图或原创素材。

## 23. 开发里程碑

### M0：仓库与数据骨架

- 建 monorepo。
- 加 shared/content/sim/client。
- 导入本资料包 JSON。
- Zod schema 与内容验证器。
- CI：typecheck、lint、test。

### M1：确定性战斗内核

- 网格、占格、实体、固定 tick。
- 移动、索敌、攻击、伤害、死亡。
- 种子随机、事件日志、回放。
- 无 UI 的 100+ 单测。

### M2：阵型编辑器与战斗可视化

- 6×15 网格。
- 拖放、旋转关闭、人口与冲突提示。
- Phaser 实体与基础动画。
- 手动释放 4 类法术。

### M3：城市与经济

- 40×40 城市。
- 建造、升级、生产、收取、人口。
- 招募队列。
- IndexedDB 存档与迁移。

### M4：成长与内容

- 英雄升级、兵种 1~6 级。
- 18 法术数据与代表性能力。
- 20 关 PvE、任务、奖励。
- 新手引导。

### M5：在线异步 PvP

- 账号、服务器存档、权威结算。
- 防守快照、匹配、战报。
- 限流、幂等与反作弊。

### M6：联盟与扩展系统

- 联盟、装备、符文、宝石、宠物。
- 海战/战场先做技术原型，再决定是否产品化。

## 24. 给 GPT/Codex 的工作协议

GPT 不得在一次回复中“生成整个游戏”。每轮只完成一个可验收里程碑，并遵守：

1. 先阅读本设计文档和种子 JSON。
2. 输出本轮目标、文件树、关键决策和已知风险。
3. 生成完整文件，不用“其余省略”。
4. 核心路径不能留 TODO、伪代码或空实现。
5. 每个核心模块必须配测试。
6. 不使用 `Math.random()` 和 `Date.now()` 驱动模拟。
7. 不在 UI 中写死数值。
8. 不复制《小小帝国》的原素材、Logo、文本剧情或反编译代码。
9. 遇到资料缺失时：
   - 优先使用 JSON 中的 `unknown/partial`；
   - 提出可配置默认值；
   - 在 `ASSUMPTIONS.md` 记录；
   - 不伪装成原版确定数值。
10. 每轮末尾给出运行命令、测试命令、完成清单与下一轮输入提示。

## 25. 首轮可直接发送给 GPT 的提示词

```text
你是该项目的主程。请读取附件《小小帝国_公开资料复原与GPT实现设计文档》和
《小小帝国_可执行种子数据.json》。

只实现 M0 + M1，不要实现城市 UI、联网、联盟或商业化功能。

技术栈：
- TypeScript
- pnpm workspace
- Vite（仅建立 client 空壳）
- packages/shared
- packages/content（Zod 校验）
- packages/sim（完全无 DOM、无 Phaser）
- Vitest

M1 必须完成：
1. 6×15 战场及双方部署区；
2. 1×1、2×1、2×2 占格验证；
3. 固定 100ms tick；
4. 确定性带种子 RNG；
5. 同行优先的稳定索敌；
6. 移动、攻击、护甲克制、最小伤害、死亡；
7. 牧师治疗；
8. 忍者多目标、钢铁之轮弹射、机械巨魔双目标；
9. 战斗结果与事件回放；
10. 内容数据加载与校验；
11. 至少 30 个单元测试，其中必须包含“相同输入和种子结果哈希一致”。

输出要求：
- 先给最终目录树。
- 然后逐文件给出完整内容，不允许省略。
- 给出 pnpm 安装、构建、测试命令。
- 核心实现不得留 TODO。
- 所有无法从资料确认的默认值写入 ASSUMPTIONS.md，并做成配置。
- 使用几何/文本占位，不生成或复制原作受版权保护的素材。
```

## 26. 缺失数据与冲突登记

| 项目 | 状态 | 处理 |
|---|---|---|
| 原作完整逐级兵种曲线 | 缟失 | 用 Lv1/Lv6 插值做 MVP，保留 levels[] 替换能力 |
| 后 4 兵种部分攻击/护甲/占格/成本 | 不完整 | 保留 null/unknown，不进入默认 MVP |
| 全部建筑成本、升级表、生产容量 | 不完整 | 核心建筑用公开值，其他由平衡表原创 |
| 全部法术及高阶/NFS 法术 | 不完整 | 18 个公开法术为种子，高阶内容留扩展 |
| 关卡阵型、掉落率、活动表 | 无完整公开数据 | 制作原创关卡与透明掉落表 |
| Earth Medal 抵抗成长 | 页面冲突：约 2% vs 1.2% | 默认 2%，配置化并注明来源冲突 |
| House 1 级人口 | 早期攻略约 +5，后期 Wiki 约 +10 | 以内容版本区分；MVP 默认 +10 |
| 发行年份 | 归档来源出现 2011/2012 差异 | 文档写“2011 年末至 2012 年前后” |
| 最小伤害 | 未明确 | MVP 采用 1，标记 implementation_assumption |
| 城市网格与离线收益上限 | 未明确 | 40×40、8 小时为现代实现决策 |

## 27. 来源登记

| ID | 来源 | 类型 | 支持内容 | 可靠性 |
| --- | --- | --- | --- | --- |
| O1 | Camel Games 官方《Little Empire》产品页与停服公告 | 官方 | 游戏定位、3 名英雄、12 类基础兵种、建筑/联盟/竞技/冒险概述、停服时间 | 高 |
| A1 | APKPure《Little Empire》应用归档 | 应用商店归档 | Android 版本 1.26.4、更新时间、安装包体积、最低系统要求、历史版本 | 中高 |
| A2 | Uptodown / GameFAQs 应用归档 | 应用归档 | 包名、发行年代交叉验证 | 中 |
| G1 | Gamezebo Little Empire Quick Start Guide | 媒体攻略 | 早期 UI、资源栏、城市建造、招募、战斗部署、法术手动释放、等级 6 开启 PvP | 中高 |
| W1 | Little Empire Wiki - Heroes / Hero System | 玩家 Wiki | 三英雄基础属性、定位、英雄技能、勋章、第二英雄 | 中 |
| W2 | Little Empire Wiki - Units / Attack & Armor | 玩家 Wiki | 16 个可用兵种、基础与高级属性、克制、伤害公式、占格、人口与招募成本 | 中 |
| W3 | Little Empire Wiki - Spells | 玩家 Wiki | 公开法术等级、伤害/治疗、冷却、升级消耗 | 中 |
| W4 | Little Empire Wiki - Buildings / Resources / Research | 玩家 Wiki | 建筑尺寸与部分成本、资源用途、科技类别 | 中 |
| W5 | Little Empire Wiki - Adventures / Tasks / Reputation / Pets / Runes / Gems | 玩家 Wiki | 中后期系统、开放等级、奖励与成长方向 | 中 |
| W6 | Little Empire Wiki - Sea War / Battlefield / Alliance | 玩家 Wiki | 联盟、海战船只、战场模式的公开描述与部分数值 | 中 |
| C1 | 公开玩家技术资料：6×7 + 1×7 + 6×7 战场布局 | 社区技术资料 | 战场为 6 行 × 15 列，双方各 7 列，中间 1 列隔离带 | 中 |

## 28. 文件清单

- `小小帝国_公开资料复原与GPT实现设计文档.md`：机器可读、适合直接粘贴给模型。
- `小小帝国_公开资料复原与GPT实现设计文档.docx`：评审/打印版。
- `小小帝国_可执行种子数据.json`：内容系统初始数据，包含来源状态和缺失标记。
- `小小帝国_GPT实现资料包.zip`：以上文件的打包版本。
