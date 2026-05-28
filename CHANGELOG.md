# Changelog

本文件记录 Persist 的版本变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [0.3.0] - 2026-05-28

### 概述

**Persist v0.3.0 — Tool-Augmented Execution Runtime**

在 v0.2 Memory-aware Runtime 上引入 **Single Tool Call Runtime**：Provider Function Calling + Runtime-controlled `ToolExecutor` + `ToolExecutionSnapshot` 可审计 Replay。

### Added

- **`@persist/tool`** — 纯 policy（单 call 限制、多 call 截断、payload 截断、`query_sales` SQL 模板）
- **`@persist/mcp-tool-adapter`** — MCP → `ToolDefinition` / `McpToolExecutor`（integration）
- **Tool 契约** — `ToolDefinition`、`ToolExecutor`、`ToolExecutionSnapshot`、扩展 `ChatMessage` / `RuntimeChunk`
- **`executeChat` §9 双路径** — 无 tool_call 单次 provider；有 tool_call 时 Tool 执行 + 第二次 memory injection + provider #2
- **`SqliteInProcessToolExecutor`** + 独立只读 `sales-fixture.db`（Sales Demo）
- **Replay** — `SessionReplay.toolExecutionSnapshots`
- **Qwen Function Calling** — 流式 `tool-call-*` + `done.providerMetadata.toolCalls`

### Architecture

- `packages/tool` 无 I/O（NFR-TOOL-03）；InProcess Executor 落 `packages/storage`
- `runtime` 禁止 import `mcp-tool-adapter`
- v0.2 Memory 语义不变（除 bugfix）

### 已知限制 / 集成说明

- **默认 API DI**：`SqliteInProcessToolExecutor` + `query_sales` Sales fixture（`SALES_FIXTURE_DATABASE_URL`）
- **`McpToolExecutor`**：已在 `@persist/mcp-tool-adapter` 实现并通过测试；生产 API 未默认接线，可通过替换 `ToolExecutor` DI 启用
- **Web**：SSE 忽略 tool observability / execution chunks；Tool Timeline 未实现（DoD 可选）

## [0.2.0] - 2026-05-27

### 概述

**Persist v0.2.0 — Memory-aware Execution Runtime**

在 v0.1 Stateful Chat Runtime 上引入 **Summary-based Runtime Continuity Memory**：bounded-context injection、持久化 continuity artifact、post-execution summary generation、可审计 replay。

> Persist is fundamentally an execution runtime with persistence and replayability.

### Added

- **Monorepo 结构**（pnpm workspaces，在 v0.1 基础上扩展）
  - `@persist/shared` — 唯一契约源（Session / Message / RuntimeChunk / MemoryEntry / MemoryInjectionSnapshot / Ports）
  - `@persist/memory` — orchestration / policy（`resolveInjection`、`planMemoryGeneration` 等纯函数，无 I/O）
  - `@persist/runtime` — persistence-aware `executeChat`（injection → provider → generation pipeline）
  - `@persist/provider` — `QwenProvider` + `LlmSummaryMemoryGenerator`（generation 仅 `provider.chat`，不经 `executeChat`）
  - `@persist/storage` — SQLite + Drizzle；`SqliteSessionStore` / `SqliteMemoryStore` / `SqliteInjectionSnapshotStore`
  - `@persist/api` — Fastify + SSE transport adapter
  - `@persist/web` — Next.js UI shell（含只读 Runtime Continuity Memory 面板）

- **Runtime Continuity Memory（v0.2 核心）**
  - Summary-based continuity artifact（`MemoryEntry`，`type: 'summary'`）
  - Bounded Context Execution：Active Summary（system）+ 最近 K 条 messages（默认 K=6）
  - Post-execution generation：`done(completed)` 且 message 数 ≥ 阈值（默认 8）后生成 / 更新 summary
  - `replaceActiveSummary` 原子 supersede（IC-MEM-03）
  - `MemoryInjectionSnapshot`：审计「模型当时看到的 `resolvedMessages`」

- **RuntimeChunk 事件流**（Runtime-native，非 OpenAI delta 直通）
  - Execution：`message-start` / `text-delta` / `message-end` / `usage` / `error` / `done`
  - Observability（不驱动 message lifecycle）：`memory-injected` / `memory-generated`

- **REST API（v0.2）**
  - `POST /api/sessions` — 创建 Session
  - `GET /api/sessions/:id` — 获取 Session 与消息
  - `POST /api/sessions/:id/messages` — 流式 Chat（SSE）
  - `GET /api/sessions/:id/replay` — 历史 reconstruction（含 `memories`、`injectionSnapshots`；不重新调用 LLM）
  - `GET /api/sessions/:id/memories` — 列出 Session 内 continuity artifacts（inspect）

- **持久化模型**
  - Session：`userId` nullable、`metadata` JSON
  - Message：Runtime artifact（`completionState`、`providerMetadata`、timestamps）
  - MemoryEntry：continuity summary（`supersededBy` 保留历史，不删除）
  - MemoryInjectionSnapshot：`triggerMessageId`、`resolvedMessages`、`injectedMemoryIds`

- **测试** — Vitest（32 tests）：shared memory contracts、memory policy、runtime injection/generation、storage supersede、provider generator

- **CI/CD**
  - CI：Prettier → ESLint → typecheck → test → build
  - CD：main 分支构建产物（Actions Artifacts）
  - Release：tag `v*.*.*` 触发 GitHub Release（runtime / api / web 构建包）

### Architecture

- Core（`shared` / `memory` / `runtime`）与 Integration（`provider` / `storage` / `api`）分层
- `runtime` 仅依赖 `ChatProvider` 接口，禁止绑定具体 Provider
- `provider` 不依赖 `runtime`（Vendor Protocol Adaptation only）
- `memory` 包无 HTTP / SQLite / Provider 实现依赖（NFR-MEM-03）
- Memory = **Runtime Continuity Artifact**（非 RAG / 非 chat history UI state）
- Provider-neutral：`ChatRequest` 未扩展；injection 在 runtime + memory 组装
- Persistence-first：injection snapshot、message stream、memory generation 均嵌入 `executeChat` 生命周期
- **Per-session only**；无 cross-session continuity

### 明确未包含（后续 Phase）

- Cross-session / User Profile Memory（需 identity / Auth）
- 即时 fact 写入 API（如 `POST /summarize` 绕过 runtime）
- Tool Runtime（MCP）
- Planning Runtime
- Auth / 多用户 / Vector DB / RAG / Agent Loop / Event Bus

### 快速开始

```bash
pnpm install
# 在项目根目录创建 .env（勿提交），配置 DASHSCOPE_API_KEY 等
pnpm -r run build
pnpm dev          # API :3001
pnpm dev:web      # Web :3000
```

同 Session 内累计约 **8 条消息** 后，Web 右侧 **Runtime Continuity Memory** 面板将出现 Active summary（跨 Session 不继承，见 Architecture）。

### 贡献者

- lens68

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
