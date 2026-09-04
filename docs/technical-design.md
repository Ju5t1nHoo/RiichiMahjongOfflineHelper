# 系统开发设计

> 版本 v0.1，经系统设计访谈确认。配套：`docs/adr/0003`（技术栈）、`0004`（游客不持久化）、`0005`（共享 rules 包）、`docs/requirements.md`。

## 1. 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React + TypeScript + Vite（移动端 SPA） |
| 后端 | Node.js + Hono（REST API） |
| 数据库 | PostgreSQL + Prisma ORM |
| 认证 | session cookie + bcrypt，会话存 DB |
| 部署 | Docker Compose（nginx + api + postgres） |
| 包管理 | pnpm workspaces（monorepo） |

## 2. 项目结构（monorepo）

```
repo/
├── apps/
│   ├── web/                React + Vite + TS（前端）
│   └── api/                Hono + Prisma（后端）
├── packages/
│   └── rules/              共享结算计算（纯函数，无依赖）
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

- `packages/rules` 是唯一放点数计算逻辑的地方，`apps/web`（实时预览）与 `apps/api`（结算落库/校验）都 import 它（见 ADR-0005）。
- 前端每次结算把**输入（番/符/结果类型/亲/子/本场）+ 计算结果**一起发给后端，后端用 rules 复核后落库。

## 3. 部署架构（Docker）

```
docker-compose
├── web   nginx        ← React 构建产物（静态）+ 反代 /api/* → api:3000
├── api   node:hono    ← REST API + Prisma；启动时 prisma migrate deploy
└── db    postgres     ← 数据（命名卷持久化）
```

- `web`：多阶段构建（node 构建 SPA → nginx 托管），nginx 把 `/api/` 反向代理到 `api`。
- `api`：Node 镜像，启动先跑 `prisma migrate deploy`，再起服务。
- `db`：Postgres，数据卷持久化；连接串/密码走环境变量（`.env`，不进仓库）。

## 4. 数据模型（Prisma schema）

```prisma
model User {
  id           String   @id @default(cuid())
  username     String   @unique
  passwordHash String
  signature    String   @default("")
  createdAt    DateTime @default(now())
  players      Player[]
  games        Game[]
  sessions     Session[]
  feedbacks    Feedback[]
}

model Player {
  id          String  @id @default(cuid())
  name        String
  avatar      String?             // 可选，默认名称首字文字头像（前端生成）
  boundUserId String? @map("bound_user_id")
  boundUser   User?   @relation(fields: [boundUserId], references: [id])
  participants GameParticipant[]
  @@index([name])
}

model Session {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
  createdAt DateTime @default(now())
}

model Game {
  id            String   @id @default(cuid())
  creatorUserId String   @map("creator_user_id")
  creator       User     @relation(fields: [creatorUserId], references: [id])
  mode          Int              // 2 / 3 / 4
  ruleSnapshot  Json     @map("rule_snapshot")
  status        String           // PLAYING / FINISHED
  createdAt     DateTime @default(now())
  endedAt       DateTime?
  participants  GameParticipant[]
  settlements   Settlement[]
}

model GameParticipant {
  id            String   @id @default(cuid())
  gameId        String   @map("game_id")
  game          Game     @relation(fields: [gameId], references: [id])
  seat          Int              // 0~3
  playerId      String?  @map("player_id")      // 全局雀士
  player        Player?  @relation(fields: [playerId], references: [id])
  tempName      String?  @map("temp_name")      // 临时雀士（与 playerId 二选一）
  finalRawScore Int?     @map("final_raw_score")
  finalScore    Decimal? @map("final_score") @db.Decimal(6, 1)  // 得点，保留一位小数
  rank          Int?
  @@unique([gameId, seat])
}

model Settlement {
  id      String  @id @default(cuid())
  gameId  String  @map("game_id")
  game    Game    @relation(fields: [gameId], references: [id])
  seq     Int             // 局序号
  type    String          // RON / TSUMO / DRAW / CHOMBO
  subType String? @map("sub_type")   // DRAW: NOTEN / ABORTIVE / NAGASHI_MANGAN
  han     Int?
  fu      Int?
  honba   Int     @default(0)
  detail  Json            // 各家明细：赢家/放铳/立直/听牌/点数变动…
  @@unique([gameId, seq])
}

model Feedback {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  content   String
  contact   String?
  createdAt DateTime @default(now())
}
```

要点：
- 临时雀士**不进 Player 表**，只以 `GameParticipant.tempName` 存在（见 ADR-0004）。
- 牌局创建者 `creatorUserId` **非空**（游客不持久化）。
- 结算 `detail`（JSONB）承载随结果类型变化大的各家明细；`type/han/fu/subType/honba` 走规范化列供统计查询。

## 5. 认证与会话

- 注册：用户名 + 密码（bcrypt 哈希）+ 确认密码。
- 登录：校验密码 → 生成 session token → 存 `Session` 表 + 下发 httpOnly cookie。
- 鉴权中间件：读 cookie → 查 `Session` → 注入 `User`；需登录接口（数据统计/个人中心/保存牌局）据此拦截。
- 退出：删 session + 清 cookie。

## 6. 结算规则模块（packages/rules）

纯函数、无副作用、无框架依赖，导出：

- `baseOf(han, fu)` → 基本点（1~4 番 `min(符×2^(番+2), 2000)`，5 番以上满贯档位自动推导）。
- `tierOf(han)` → 满贯档位（满贯/跳满/倍满/三倍满/役满/N倍役满）。
- `needFu(han)` → 是否需要符。
- `ronAmount / tsumoAmount`（亲/子系数、本场、自摸分摊）。
- `settleRon / settleTsumo / settleDraw / settleChombo` → 返回各参与者点数变动 + 头跳处理。
- 类型：`Mode`、`SettlementType`、`RuleSnapshot`。

规则参数（`RuleSnapshot`）来自 `requirements.md` §5 表（局数/基础分/返点/本场点棒/不听罚符/番缚/切上满贯/击飞/终局第一无限连庄/马点/得点保留一位小数）。

## 7. API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/auth/register | 注册（用户名+密码） |
| POST | /api/auth/login | 登录，下发 session cookie |
| POST | /api/auth/logout | 退出 |
| GET | /api/auth/me | 当前用户 |
| GET | /api/players | 雀士搜索（含未绑定，用于「绑定雀士」） |
| POST | /api/players | 创建雀士（自动绑定） |
| PATCH | /api/players/:id | 编辑（名称/头像，仅限自己绑定） |
| DELETE | /api/players/:id | 解绑（释放所有权） |
| POST | /api/games | 开局（创建牌局，保存为进行中） |
| GET | /api/games/mine | 我的创建（含进行中/已终局） |
| GET | /api/games/feed | 数据广场（已终局，时间倒序） |
| GET | /api/games/:id | 牌局详情（含逐局结算） |
| POST | /api/games/:id/settlements | 追加一条结算（rules 复核后落库） |
| PATCH | /api/games/:id | 终局 / 恢复（改状态） |
| GET | /api/stats/players | 雀士排行榜（模式/排序/搜索/分页） |
| GET | /api/stats/players/:id | 雀士详情（全量指标） |
| POST | /api/feedback | 意见反馈 |

## 8. 统计计算

统计在服务端按雀士、按模式聚合（见 `requirements.md` §6 指标表）：

- **牌局级**：从 `GameParticipant`（牌局数、平均顺位、顺位分布、最终素点/得点、击飞次数 = 素点 < 0）。
- **手级**：从 `Settlement`——和牌率/放铳率/立直率按「手数」、自摸率按「和牌次数」、平均番数按「和牌番数之和」，由 `detail` JSONB 与规范化列联合查询。
- 临时雀士不参与统计（无 Player 行）。
