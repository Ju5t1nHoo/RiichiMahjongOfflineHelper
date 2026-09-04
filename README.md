# 立直麻将线下 H5 计分工具

一个帮助线下日麻牌局记录分数与顺位、并为注册用户沉淀雀士数据与统计的移动端 H5 工具。

**核心定位**：这是「点数计算器 + 牌局记录器」，**不是规则判定引擎**。不吃碰杠、不判役种、不管宝牌/拔北——这些牌面机制全部折算为「番」，由使用者在结算时手动输入。工具只负责：算钱（番×符→点数）、记分（自动推进本场/庄家/场风）、统计。

## 功能模块

- **计分风盘**：四人/三人/二人，位置布局选人、随机庄家、规则临时覆盖；荣和（多家、头跳）/自摸/流局（不听罚符/途中流局/流局满贯）/罚符；立直棒、本场、供托自动记分；击飞/不满返点延局/终局第一无限连庄；终局顺位（含 TOP赏、马点）。
- **数据统计**：我的创建 / 数据广场 / 雀士数据（排行榜 + 详情，牌局级 + 手级指标）。
- **个人中心**：登录/注册、个性签名、雀士管理、规则默认设置、修改密码、意见反馈。

## 技术栈

pnpm monorepo：

| 包 | 说明 |
|---|---|
| `apps/web` | React + TypeScript + Vite 前端 |
| `apps/api` | Hono + Prisma 后端（PostgreSQL） |
| `packages/rules` | 结算计算（单一来源），含番符/满贯档位/结算/局面推进/终局顺位 |

架构与决策见 `docs/technical-design.md` 与 `docs/adr/`（ADR-0001「点数计算器≠规则引擎」等）。领域词汇表见 `CONTEXT.md`。

## 开发

```bash
npx pnpm@10 install                          # 装依赖（须用 pnpm ≥ 8，全局 pnpm 7 与 Node 25 不兼容）
npx pnpm@10 --filter @riichi/rules test      # rules 测试
npx pnpm@10 --filter @riichi/api exec tsc --noEmit   # api 类型检查
npx pnpm@10 --filter @riichi/web build       # 前端构建
```

后端跑通需 Postgres（`DATABASE_URL`，见 `.env.example`）+ `prisma migrate`。

## 容器化部署

```bash
docker compose up --build
```

编排包含 nginx 反向代理 + api + postgres，详见 `docs/technical-design.md` §3。

## 查看原型

```bash
open mockup/scoring-table.html   # 计分风盘
open mockup/statistics.html      # 数据统计
open mockup/profile.html         # 个人中心
```

## 目录结构

- `SimpleDemand.md` — 原始需求
- `CONTEXT.md` — 领域词汇表（统一语言）
- `docs/requirements.md` — 需求规格说明书
- `docs/` — 布局设计、技术设计、ADR
- `mockup/` — HTML 交互原型（无构建、无依赖）
