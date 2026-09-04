# 技术栈选型：React + Node(Hono) + PostgreSQL，Docker 部署

采用前后端分离的 monorepo：前端 React + TypeScript + Vite（移动端 SPA），后端 Node.js + Hono（REST API），数据库 PostgreSQL + Prisma（ORM），认证 session cookie + bcrypt 密码哈希；整体用 Docker Compose 部署（nginx 托管前端并反代 API、node API 服务、postgres 数据卷）。

理由：项目是移动端 H5，含账户登录、关系型数据（用户/雀士/牌局/结算）、统计查询；计分风盘是重客户端交互。SPA + 轻量 API + 关系库最贴合该形态。选 React/Vite（生态成熟）、Hono（轻量）、PostgreSQL+Prisma（类型安全、迁移清晰）、session+bcrypt（简单可靠）。

备选：Next.js 全栈框架（一套代码但引入 SSR 复杂度）、Supabase（省后端但绑定第三方托管）、Vue/Svelte 前端。

代价：需维护 web / api / db 三层与 Docker 编排；若日后想迁 SSR 或换云服务，存在迁移成本。
