# Changelog

本文件记录 Persist 的版本变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [0.4.0] - 2026-05-28

### 概述

**Persist v0.4.0 — Planning Runtime**

`executeChat` 主路径重写为 **PlanGenerator → 至多 1× ToolExecutor → 单次 synthesis（无 tools）**。Provider Function Calling 不再是默认 tool 选择路径；Plan 存于 `PlanSnapshotStore`，不进 Message 时间线。

### Added

- `@persist/plan` — ExecutionPlan 校验、首 tool step 选择、executionTrace 策略
- `@persist/planning` — `RuleBasedPlanGenerator`（Sales demo，CI 默认）
- `@persist/provider` — 可选 `LlmPlanGenerator`
- **Planning 契约**（`@persist/shared`）：`PlanGenerator`、`PlanSnapshotStore`（含 `updateExecutionTrace`）、plan observability chunks、`SessionReplay.planSnapshots`
- **Storage**：`plan_snapshots` 表；`tool_execution_snapshots.plan_id` / `plan_step_id`（`planId` = `PlanSnapshot.id`，非 ExecutionPlan 内嵌 id）
- **Runtime**：`plan-generation-phase`、`plan-execution-phase`、`planned-tool-execution-phase`

### Changed

- **Breaking**：v0.3 FC 双 Provider 路径已移除；每 turn 仅一次 memory injection（IC-PLAN-09：synthesis 从 `getSessionWithMessages` 重建上下文）
- Message 时间线（IC-PLAN-10）：`user → [tool] → assistant`（无 pre-tool assistant）
- 多 tool plan step 由 `plan-step-truncated` 表达（主路径不 emit `tool-call-truncated`）

## [0.3.0] - 2026-05-28

### 概述

**Persist v0.3.0 — Tool-Augmented Execution Runtime**

在 v0.2 Memory-aware Runtime 上引入 **Single Tool Call Runtime**：Provider Function Calling + Runtime 控制的 `ToolExecutor` + `ToolExecutionSnapshot` 可审计 Replay；Sales Demo（`query_sales` → 只读 SQLite fixture）验证「LLM 不直连数据库」。

> Persist is fundamentally an execution runtime with persistence and replayability.

### Added

- **Monorepo 扩展**（pnpm workspaces）
  - `@persist/tool` — 纯 policy（单 call 限制、多 call 截断、payload 截断、`query_sales` SQL 白名单模板；**无 I/O**）
  - `@persist/mcp-tool-adapter` — MCP → `ToolDefinition` / `McpToolExecutor`（integration，包级实现 + 测试）
  - `@persist/runtime` — `executeChat` §9 双路径（`provider-chat-phase` / `tool-execution-phase`）
  - `@persist/storage` — `SqliteInProcessToolExecutor`、`SqliteToolExecutionSnapshotStore`、`sales-fixture.db`
  - `@persist/provider` — Qwen Function Calling（`tools` / `tool-call-*` / `providerMetadata.toolCalls`）
  - `@persist/api` — DI：`ToolExecutor` + `QUERY_SALES_TOOL_DEFINITION`；Replay 返回 `toolExecutionSnapshots`
  - `@persist/web` — Tool 场景 SSE 过滤 + 流结束后从 Session 同步最终 assistant 文本

- **Tool 契约**（`@persist/shared`）
  - `ToolDefinition`、`ToolExecutor`、`ToolExecutionSnapshot`、`CreateToolExecutionSnapshotInput`
  - 扩展 `ChatMessage`（`tool` role、`toolCallId` / `toolName`）、`RuntimeChunk`（`tool-call-*` / `tool-result` / `tool-payload-truncated`）
  - 扩展 `SessionReplay.toolExecutionSnapshots`、`ProviderMetadata.toolCalls`

- **Single Tool Call Runtime（v0.3 核心）**
  - 无 `tool_call`：Memory injection → Provider #1 →（可选）Memory generation
  - 有 `tool_call`：Provider #1 → **单次** `ToolExecutor.call()` → Memory injection #2 → Provider #2 →（可选）Memory generation
  - `query_sales`：参数 `metric` / `period` → 模板 SQL → 只读 `sales-fixture.db`（IC-TOOL-07，禁止 LLM 自由拼 SQL）
  - Tool 失败仍走 Provider #2 + generation（IC-TOOL-10）；Replay **不**重新执行 Tool / LLM（NFR-TOOL-04）

- **RuntimeChunk 事件流**（在 v0.2 基础上扩展）
  - Tool execution：`tool-call-start` / `tool-call-end` / `tool-result`
  - Tool policy observability：`tool-call-truncated` / `tool-payload-truncated`
  - v0.2 Memory observability 不变：`memory-injected` / `memory-generated`

- **REST API（v0.3）**
  - `POST /api/sessions/:id/messages` — 注册 tools 后流式 Chat（SSE）
  - `GET /api/sessions/:id/replay` — 含 `toolExecutionSnapshots`（与 messages / memories / injectionSnapshots 一并重建）

- **持久化模型**
  - `tool_execution_snapshots`：`toolInput` / `toolOutput` / `status` / `payloadTruncated`
  - Message 列：`tool_call_id`、`tool_name`（tool 角色消息）

- **演示脚本**（`scripts/`，非构建产物）
  - `run-tool-demo.mjs` — Sales / `query_sales` 端到端脚本验证
  - `run-memory-demo.mjs` — v0.2 Memory 演示

- **测试** — Vitest（66 tests，1 skipped）：shared tool contracts、tool policy、runtime 双路径 / IC-TOOL-10、storage snapshot + fixture、provider FC、mcp adapter

- **CI/CD**
  - CI：Prettier → ESLint → typecheck → test → build
  - CD：main 分支构建产物（Actions Artifacts）
  - Release：tag `v*.*.*` 触发 GitHub Release（runtime / api / web 构建包）

### Fixed

- Qwen FC：流结束后发出完整 `tool-call-start` / `tool-call-end`；解析 `message.tool_calls`；DashScope 无 tool body 时 Sales demo 安全回退
- Tool 失败快照：`toolOutput` 持久化与 Web Provider #2 气泡同步
- Release 打包：`stage-artifacts.sh` 避免 `find | head` SIGPIPE 导致 CI 失败

### Architecture

- Core（`shared` / `memory` / `runtime` / `tool`）与 Integration（`provider` / `storage` / `mcp-tool-adapter` / `api` / `web`）分层
- `packages/tool` **无** SQLite / Drizzle / HTTP（NFR-TOOL-03）；InProcess Executor 在 `packages/storage`
- `runtime` 仅依赖 `ToolExecutor` 端口，**禁止** import `mcp-tool-adapter`
- `provider` 不依赖 `runtime`；Qwen 仅做 Vendor Protocol Adaptation
- v0.2 Memory 语义不变（injection / generation / replay 扩展，非替换）
- **Per-turn 单次** `ToolExecutor.call()`；多 call 由 policy 截断为 1（IC-TOOL-06）
- Persistence-first：tool snapshot、tool 消息、provider metadata 均进入 `executeChat` 生命周期

### 已知限制 / 集成说明

- **默认 API DI**：`SqliteInProcessToolExecutor` + `query_sales`（`SALES_FIXTURE_DATABASE_URL`，默认 `file:./.data/sales-fixture.db`）
- **`McpToolExecutor`**：已在 `@persist/mcp-tool-adapter` 实现并通过测试；生产 API **未**默认接线，可替换 `ToolExecutor` DI 启用 MCP
- **Web**：SSE 忽略 tool observability / execution chunks；仅展示最终 assistant 文本；Tool Timeline 未实现（DoD 可选）

### 明确未包含（后续 Phase）

- API 默认 DI `McpToolExecutor` / MCP Server 运维文档
- Web Tool Timeline（可选 DoD）
- Cross-session / User Profile Memory
- Planning Runtime
- Auth / 多用户 / Vector DB / RAG / **Autonomous Agent Loop** / Event Bus

### 快速开始

```bash
pnpm install
# 在项目根目录创建 .env（勿提交），配置 DASHSCOPE_API_KEY、DATABASE_URL、SALES_FIXTURE_DATABASE_URL 等
pnpm -r run build
pnpm dev          # API :3001
pnpm dev:web      # Web :3000
```

**Sales Demo（实验 7）**：在 Web 或 `node scripts/run-tool-demo.mjs` 中提问，例如「上个月按 revenue 销量第一的产品」；预期 **Widget A** / revenue **12000**。审计：`GET /api/sessions/:id/replay` 查看 `toolExecutionSnapshots`。

v0.2 Memory 面板行为不变：同 Session 约 **8 条消息** 后出现 Active summary。

### 贡献者

- lens68

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
