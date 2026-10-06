# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目是什么

立直麻将（日本麻将）线下 H5 计分工具。已进入**实现阶段**：pnpm monorepo（`apps/web` React 前端 + `apps/api` Hono 后端 + `packages/rules` 结算计算）。技术栈与架构见 `docs/technical-design.md` 与 ADR-0003~0005。所有文档均为中文。本目录**不是 git 仓库**。

## 目录与阅读顺序

- `SimpleDemand.md` — 原始需求（模块级描述）。
- `CONTEXT.md` — **领域词汇表（统一语言）**。纯术语定义，不是规格、不是草稿。
- `docs/requirements.md` — 完整需求规格说明书（9 章，含规则参数汇总表、点数档位表、亲/子系数）。
- `docs/scoring-table-layout.md` — 计分风盘（核心界面）的布局与排版设计。
- `docs/statistics-layout.md` — 数据统计模块（我的创建 / 数据广场 / 雀士数据）的布局与排版设计。
- `docs/profile-layout.md` — 个人中心模块（登录/注册 + 资料 hub + 雀士管理 / 规则默认设置 / 修改密码 / 意见反馈）的布局与排版设计。
- `docs/technical-design.md` — 系统开发设计（技术栈、monorepo、Docker、Prisma schema、认证、共享 rules 包、API、统计）。
- `docs/adr/` — 架构决策记录。
- `mockup/` — 三个 HTML 交互原型（scoring-table / statistics / profile，无构建、无依赖，浏览器直接打开）。

## 查看原型

```bash
open mockup/scoring-table.html   # 计分风盘
open mockup/statistics.html      # 数据统计
open mockup/profile.html         # 个人中心
```

## 开发

```bash
npx pnpm@10 install                          # 装依赖（全局 pnpm 7 与 Node 25 不兼容，须用 pnpm ≥ 8）
npx pnpm@10 --filter @riichi/rules test      # rules 测试
npx pnpm@10 --filter @riichi/api exec tsc --noEmit   # api 类型检查
```

- monorepo：`apps/web`（React+Vite）、`apps/api`（Hono+Prisma）、`packages/rules`（结算计算，单一来源）。
- Node 版本：本机 nvm 默认 Node 16.16.0（`system` 为 Node 25.8.0）。`vite build`（web）与 `vitest`（rules 测试）要求 Node ≥18，在 Node 16 下会报 `crypto.getRandomValues is not a function`；跑这些前先 `nvm use system`（或装 Node ≥18）。`tsc --noEmit` 在 Node 16 下也能跑。
- 后端跑通需 Postgres（`DATABASE_URL`）+ `prisma migrate`；完整容器化部署见 `docs/technical-design.md` §3。

## 最关键的架构事实（先读 ADR-0001）

**这是「点数计算器 + 牌局记录器」，不是「规则判定引擎」。** 不吃碰杠、不判役种、不管宝牌/拔北——这些牌面机制全部折算为「番」，由使用者在结算时手动输入。工具只负责：算钱（番×符→点数）、记分（自动推进本场/庄家/场风）、统计。

因此结算输入 = (番数, 符数, 荣和/自摸/流局/罚符, 亲/子, 本场, 立直棒)，**没有牌面/手牌建模**。

## 领域模型速览（详见 CONTEXT.md）

- **身份**：`用户`（账号，用户名+密码）→ 绑定多个 `雀士`（全局玩家档案，创建即绑定、可解绑换绑；一个雀士至多被一个用户绑定）；`临时雀士`（单局有效，游客/登录通用，不持久化）。
- **模式**：`四人 / 三人 / 二人`，规则默认值不同——基础分 25000/25000/50000、返点 30000/30000/50000、本场点棒 300/200/300、马点 `10-5`/`+10·0·−10`/`+10·−10`。
- **结算四类**：荣和（可多家荣和、供托按「头跳」）、自摸、流局（不听罚符 / 途中流局 / 流局满贯）、罚符（罚点 8000/12000/16000/24000/32000 五个满贯档位值）。
- **点数**：基本点 = 符×2^(番+2)，封顶 2000（满贯）→3000 跳满→4000 倍满→6000 三倍满→8000 役满→…；番为数字（1~13、26/39/52/65/78），番 1–4 需选符，5 番及以上满贯档位由番数自动推导。
- **顺位**：按素点排；得点 = (素点 − 返点)/1000 + 马点。

## 文档维护约定

- `CONTEXT.md` 只放领域术语（每词 1–2 句，`_Avoid_` 列别名）；**不要**把它当规格或实现细节仓库。术语一旦确认就当场更新，不要攒批。
- ADR 仅在同时满足三条时才写：难以逆转、缺上下文会令人困惑、是真实权衡的结果。已有 0001（点数计算器≠规则引擎）、0002（牌局全公开无隐私）、0003（技术栈）、0004（游客不持久化）、0005（共享 rules 包）。
- 领域术语以中文/日麻术语为准，不要另起英文名。
