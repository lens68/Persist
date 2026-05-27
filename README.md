# Persist

**Persistent Execution Runtime** — Stateful Chat Runtime（v0.1）。

Chat 是当前第一种 execution form；长期演化为 tool / planning / agent execution。

> 架构治理文档（`AGENTS.md`、`docs/`）仅保留在本地，不推送到 GitHub。

## 技术栈

- pnpm workspaces · Node 20 · TypeScript
- `@persist/runtime` + `@persist/shared`（Core）
- `@persist/provider` + `@persist/api`（Integration）
- SQLite + Drizzle · Fastify · Next.js（UI shell）

## 快速开始

```bash
pnpm install
```

在项目根目录创建 **`.env`**（勿提交），示例：

```env
DASHSCOPE_API_KEY=<your-dashscope-api-key>
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODEL=qwen-plus
API_PORT=3001
DATABASE_URL=file:./.data/persist.db
```

```bash
pnpm -r run build
pnpm dev          # API :3001
pnpm dev:web      # Web :3000
pnpm test
```

## CI/CD

- **CI**（`.github/workflows/ci.yml`）：`format:check` → `lint` → `typecheck` → `test` → `build`
- **CD**（`.github/workflows/cd.yml`）：`main` 上 CI 通过后上传构建产物（Artifacts）

## API（v0.1）

| Method | Path                                |
| ------ | ----------------------------------- |
| POST   | `/api/sessions`                     |
| GET    | `/api/sessions/:id`                 |
| POST   | `/api/sessions/:id/messages`（SSE） |
| GET    | `/api/sessions/:id/replay`          |

## 结构

```
apps/api
apps/web
packages/shared
packages/runtime
packages/provider
packages/storage
```

## License

Private — course / research project.
