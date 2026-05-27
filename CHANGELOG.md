# Changelog

本文件记录 Persist 的版本变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [0.2.0] - 2026-05-27

### 概述

**Persist v0.2.0 — Memory-aware Execution Runtime**

在 v0.1 Stateful Chat Runtime 上引入 **Summary-based Runtime Continuity Memory**：bounded-context injection、持久化 continuity artifact、post-execution summary generation、可审计 replay。

### Added

- **@persist/memory** — orchestration / policy（`resolveInjection`、`planMemoryGeneration` 等纯函数）
- **Memory 契约** — `MemoryEntry`、`MemoryInjectionSnapshot`、`MemoryStore`、`InjectionSnapshotStore`、`MemoryGenerator`
- **Observability RuntimeChunk** — `memory-injected`、`memory-generated`（不驱动 message lifecycle）
- **Storage** — `memory_entries`、`injection_snapshots` 表；`SqliteMemoryStore`（`replaceActiveSummary` 原子 supersede）
- **Generators** — `RuleBasedMemoryGenerator`、`LlmSummaryMemoryGenerator`（仅 `provider.chat`，不经 `executeChat`）
- **executeChat** — injection → provider bounded context → `done(completed)` 后 generation pipeline
- **API** — `GET /api/sessions/:id/memories`
- **Web** — 只读 Runtime Continuity Memory 面板（inspect only）

### Architecture

- Memory = Runtime Continuity Artifact（非 RAG / 非 chat history UI state）
- Provider-neutral：`ChatRequest` 未扩展；injection 在 runtime + memory 组装
- Replay：返回 `memories` + `injectionSnapshots`（含 `resolvedMessages` 审计载荷）
- Per-session only；无 cross-session / Vector / Agent Loop

### 明确未包含

- Tool Runtime（MCP）、Planning Runtime、Auth、Vector DB、Event Bus
- `POST /summarize` 等绕过 runtime 的 memory 写 API

## [0.1.0] - 2026-05-27

### 概述

**Persist v0.1.0 — Stateful Chat Runtime**

首个可运行里程碑：Persistent Execution Runtime 的地基版本。Chat 是当前第一种 execution form，具备 Provider 抽象、流式执行、Session 持久化与 Runtime Replay（历史 reconstruction）。

> Persist is fundamentally an execution runtime with persistence and replayability.

### Added

- **Monorepo 结构**（pnpm workspaces）
  - `@persist/shared` — 唯一契约源（Session / Message / RuntimeChunk / ChatProvider / SessionStore）
  - `@persist/runtime` — persistence-aware `executeChat` pipeline
  - `@persist/provider` — `QwenProvider`（DashScope OpenAI-compatible HTTP）
  - `@persist/storage` — SQLite + Drizzle schema + `SqliteSessionStore`
  - `@persist/api` — Fastify + SSE transport adapter
  - `@persist/web` — Next.js UI shell（无 Runtime 逻辑）

- **RuntimeChunk 事件流**（Runtime-native，非 OpenAI delta 直通）
  - `message-start` / `text-delta` / `message-end` / `usage` / `error` / `done`

- **REST API（v0.1）**
  - `POST /api/sessions` — 创建 Session
  - `GET /api/sessions/:id` — 获取 Session 与消息
  - `POST /api/sessions/:id/messages` — 流式 Chat（SSE）
  - `GET /api/sessions/:id/replay` — 历史 reconstruction（不重新调用 LLM）

- **持久化模型**
  - Session：`userId` nullable、`metadata` JSON
  - Message：Runtime artifact（`completionState`、`providerMetadata`、timestamps）

- **测试** — Vitest：shared contracts、provider mock HTTP、runtime stream

- **CI/CD**
  - CI：Prettier → ESLint → typecheck → test → build
  - CD：main 分支构建产物（Actions Artifacts）
  - Release：tag `v*.*.*` 触发 GitHub Release（runtime / api / web 构建包）

### Fixed

- CD/Release：`upload-artifact@v4` 遵循 `.gitignore`，`dist/`、`.next/` 路径会被排除；staging 时扁平化目录并改用 `web-next/`（无 `.next` 路径段），且 staging 根目录 `artifact-output/` 不加入 gitignore

### Architecture

- Core（`shared` / `runtime`）与 Integration（`provider` / `api`）分层
- `runtime` 仅依赖 `ChatProvider` 接口，禁止绑定具体 Provider
- `provider` 不依赖 `runtime`（Vendor Protocol Adaptation only）
- Persistence-first：Runtime 生命周期天然包含持久化

### 明确未包含（后续 Phase）

- Memory Runtime（summary-based）
- Tool Runtime（MCP）
- Planning Runtime
- Auth / 多用户 / Vector DB / Agent Loop / Event Bus

### 快速开始

```bash
pnpm install
# 在项目根目录创建 .env（勿提交），配置 DASHSCOPE_API_KEY 等
pnpm run build:packages
pnpm dev        # API :3001
pnpm dev:web    # Web :3000
```

### 贡献者

- lens68
