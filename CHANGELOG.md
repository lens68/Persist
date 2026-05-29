# Changelog

本文件记录 Persist 的版本变更。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [0.4.1] - 2026-05-29

### 概述

**Persist v0.4.1 — Session History & Workspace Navigation**

Product Capability Release：从 single-session Chat Demo 演进为 **multi-session Agent Workspace**。用户可查看、切换、恢复历史 Session，并在所选 Session 上**续聊**（Conversation Continuation）。历史加载走 Storage/Replay 读路径；续聊走既有 `POST /api/sessions/:id/messages` → `executeChat()`。

> **Workspace ≠ User Memory**（OOS-05）。本版本不引入 Cross-session Memory / User Profile Memory。

> **非 Runtime 演化**：`packages/runtime` 执行路径未改；无新 Planning / Tool / Memory 生命周期。

### Added

- **`SessionSummary` 契约**（`@persist/shared`）
  - `SessionSummarySchema`：`id`、`createdAt`、`updatedAt`、`messageCount`、`previewText?`
  - `SESSION_PREVIEW_TEXT_MAX_LENGTH = 24`（CFG-HISTORY-02）
  - `SessionStore.listSessionSummaries({ limit? })`

- **Storage 列表查询**（`SqliteSessionStore`）
  - `updatedAt DESC` 排序；`previewText` = 最早 `role=user` 消息截断；`messageCount` = 全 role 计数
  - **ADR-HISTORY-08**：`listSessionSummaries` 仅返回含至少 1 条 `role=user` 消息的 session

- **REST API**
  - `GET /api/sessions` → `SessionSummary[]`（CFG-HISTORY-01 默认 `limit=50`；CFG-HISTORY-03 clamp 1–200）
  - Handler 仅 `SessionStore` 读路径，无 Runtime deps

- **Web — Agent Workspace**
  - Sidebar：Session 列表 + New Chat + 相对时间
  - 路由 `/s/[sessionId]` + `localStorage`（`persist:lastSessionId`）
  - 根 `/`：空态 B（New Chat 按钮，不自动 POST）+ localStorage redirect
  - **ADR-HISTORY-08 Lazy Session Creation**：New Chat → `/s/new` 草稿态，**首条 user 消息**才 `POST /api/sessions`；列表仅含至少 1 条 `role=user` 的 session（无空 session 堆积）
  - **replay-only** UI 灌数据（移除 Web 对 `GET :id` / `GET .../memories` 的调用）
  - 流结束后：1× replay + 刷新 Sidebar
  - FR-HISTORY-07：无效 Session / replay 404 时禁用输入，仅可 New Chat

### Changed

- **Web 入口**：主 UI 为 `/s/[sessionId]`；根 `/` 为空态或 localStorage redirect（不再 lazy-create 于首条消息）
- **P1-2 修订（ADR-HISTORY-08）**：取代「New Chat 立即 POST」— 草稿 `/s/new` + 首条 user 消息持久化

### 工程

- Vitest **103 tests**（+9，含 `sqlite-session-history` 7 用例）；v0.4 runtime 无回归
- CI：Prettier → ESLint → typecheck → test → build（与 v0.4.0 一致）

### Out of Scope

- OOS-01 Session Rename
- OOS-02 Session Search
- OOS-03 Session Folder
- OOS-04 Session Share
- OOS-05 Cross-session Memory / User Profile Memory
- 编辑 / 删除 / 拖拽 Sidebar
- `packages/runtime` 行为变更（除 `InMemorySessionStore` 接口 stub）

### 验证

- 全量 `pnpm test` 无 v0.4 回归
- 手工 Web 验证入口：`http://localhost:3000/s/{sessionId}`（`/` 为空态或 redirect）
- `run-full-stack-demo.mjs` / `run-planning-demo.mjs` 仍走 API 直连，脚本无需修改

---

## [0.4.0] - 2026-05-28

### 概述

**Persist v0.4.0 — Planning Runtime**

在 v0.3 Tool-Augmented Runtime 上引入 **Planning Runtime**：`ExecutionPlan` 取代 Provider Function Calling 作为 tool 名称/参数/选择的唯一来源；`executeChat` 主路径重写为 **Memory injection（每 turn 一次）→ PlanGenerator → 至多 1× ToolExecutor → 单次 synthesis（无 tools）**；Plan 持久化于 `PlanSnapshotStore` 并可审计 replay。

> Persist is fundamentally an execution runtime with persistence and replayability.

### Added

- **Monorepo 扩展**（pnpm workspaces）
  - `@persist/plan` — 纯 policy（`validateExecutionPlan`、`selectFirstToolStep`、`buildInitialExecutionTrace` / `applyExecutionResults`；**无 I/O**）
  - `@persist/planning` — `RuleBasedPlanGenerator`（Sales demo 关键词映射；CI / API 默认，无 API key）
  - `@persist/provider` — 可选 `LlmPlanGenerator`（`provider.chat` 无 tools，JSON → `ExecutionPlan`）
  - `@persist/runtime` — `plan-generation-phase` / `plan-execution-phase` / `planned-tool-execution-phase`；`memory-injection-phase`（从 v0.3 FC tool phase 拆分）
  - `@persist/storage` — `SqlitePlanSnapshotStore`；`plan_snapshots` 表；`tool_execution_snapshots.plan_id` / `plan_step_id`
  - `@persist/api` — DI：`RuleBasedPlanGenerator` + `SqlitePlanSnapshotStore`
  - `@persist/web` — v0.4 UI；**Planning Runtime** 只读面板（Plan / executionTrace / Replay 时间线）；SSE 忽略 plan observability chunks

- **Planning 契约**（`@persist/shared`）
  - `ExecutionPlan` / `PlanStep` / `PlanSnapshot` / `PlanStepExecution`；`PLAN_RUNTIME_DEFAULTS`（`planningEnabled: true`）
  - `PlanGenerator` / `PlanGenerationInput`（`resolvedMessages`；**禁止** `executeChat`）
  - `PlanSnapshotStore`：`appendSnapshot` + `updateExecutionTrace`（两阶段 trace）
  - 扩展 `ToolExecutionSnapshot`：`planId` / `planStepId`（`planId` = **`PlanSnapshot.id`**，非 ExecutionPlan 内嵌 id）
  - 扩展 `SessionReplay.planSnapshots`
  - RuntimeChunk observability：`plan-generated` / `plan-invalid` / `plan-step-start` / `plan-step-end` / `plan-step-truncated`

- **Planning Runtime（v0.4 核心）**
  - **ADR-PLAN-01**：tool 的 `name` / `input` **仅**来自 `ExecutionPlan`，非 Provider FC
  - **ADR-PLAN-03**：Plan 可含多 `tool` step；Runtime **maxExecutableToolSteps = 1**；其余 `truncated`（`plan-step-truncated`）
  - **ADR-PLAN-05 / IC-PLAN-08**：`plan-invalid` 或 Tool 失败 **仍** synthesis；仅 synthesis 失败时跳过 memory generation
  - **ADR-PLAN-06 / IC-PLAN-09**：每 turn **单次** memory injection；synthesis 上下文来自 `getSessionWithMessages`（含 `role: tool` 消息）
  - **IC-PLAN-10**：无 pre-tool assistant；每 turn **一条**最终 assistant 气泡
  - `plan-invalid`：记录 invalid snapshot + synthetic response-only plan 后仍执行 synthesis

- **RuntimeChunk 事件流**（在 v0.3 基础上扩展）
  - Plan observability：`plan-generated` / `plan-invalid` / `plan-step-*`
  - Tool execution chunks 保留：`tool-call-start` / `tool-call-end` / `tool-result`（由 planned step 驱动）
  - 主路径 **不** emit `tool-call-truncated`（v0.3 FC 多 call 截断；v0.4 用 `plan-step-truncated`）

- **REST API（v0.4）**
  - `POST /api/sessions/:id/messages` — 流式 Chat（Planning 路径；Provider **不传** tools）
  - `GET /api/sessions/:id/replay` — 含 `planSnapshots` + `toolExecutionSnapshots`（不重新调用 LLM / Tool / PlanGenerator）

- **持久化模型**
  - `plan_snapshots`：`planJson`、`status`、`executionTraceJson`、`invalidReason`
  - `tool_execution_snapshots`：nullable `plan_id`、`plan_step_id`（legacy 行兼容）

- **演示脚本**（`scripts/`，非构建产物）
  - `run-planning-demo.mjs` — Planning + Sales 两场景（单 tool / 双 tool step 截断）
  - `run-full-stack-demo.mjs` — 经 Web `:3000` 代理的全链路断言

- **工程**
  - `.gitattributes` — `* text=auto eol=lf`（避免 Windows CRLF 导致 CI Prettier 失败）

- **测试** — Vitest（94 tests，1 skipped）：`packages/plan` / `planning` / plan storage replay、runtime IC-PLAN-09/10、v0.2 memory 回归

- **CI/CD**
  - CI：Prettier → ESLint → typecheck → test → build
  - CD：main 分支构建产物（Actions Artifacts）
  - Release：tag `v*.*.*` 触发 GitHub Release（runtime / api / web 构建包）

### Changed

- **Breaking — executeChat 主路径**
  - 移除 v0.3：Provider #1（带 tools）→ FC → 第二次 memory injection → Provider #2
  - 新路径：injection → plan → ≤1 tool → synthesis（单次 `provider.chat`，无 tools）
- **Breaking — Message 时间线**：`user → [tool] → assistant`（v0.3 常为 `user → assistant#1 → tool → assistant#2`）
- v0.2 Memory 语义保留（injection / generation / supersede）；阈值与 policy 未改

### Fixed

- Web `page.tsx` / `plan-panel.tsx` Prettier（CI `format:check` on Linux）
- 移除未使用的 v0.3 `executeToolCallPhase`（FC 路径死代码）；memory injection 迁至 `memory-injection-phase.ts`

### Architecture

- Core（`shared` / `memory` / `tool` / `plan` / `runtime`）与 Integration（`planning` / `provider` / `storage` / `api` / `web`）分层
- **Planning ≠ Execution**：Plan 在 `PlanSnapshotStore`；**不进** Message 时间线
- `runtime` 依赖 `@persist/plan` policy；**禁止** import `@persist/planning` / `@persist/provider` / MCP
- `planning` 仅依赖 `shared` + `plan`；`plan` 无 I/O（同 `tool` / `memory`）
- **无 Agent Loop**：禁止 `while` replan、第二遍 plan、第二次 `ToolExecutor.call()`
- Persistence-first：plan snapshot、executionTrace 更新、tool snapshot 均嵌入 `executeChat` 生命周期

### 已知限制 / 集成说明

- **默认 API DI**：`RuleBasedPlanGenerator`（非 `LlmPlanGenerator`）；Sales `query_sales` + `SqliteInProcessToolExecutor` 同 v0.3
- **对比类问题**：RuleBased 可生成 2 个 tool step，但 Runtime 只执行第一个；助手可能说明缺第二期数据（设计行为，非 bug）
- **executionTrace**：tool step `completed` 表示「Runtime 已尝试执行」；成败见 `ToolExecutionSnapshot.status`
- **Web**：Planning 面板展示 Plan / trace；聊天气泡仍仅最终 assistant；无 Plan Timeline 拖拽编辑

### 明确未包含（后续 Phase）

- API 默认 `LlmPlanGenerator` / Plan 人工审批 UI
- 每 turn 执行多个 tool step（当前硬封顶 1）
- Cross-session / User Profile Memory
- **Autonomous Agent Loop** / replan while
- Auth / 多用户 / Vector DB / RAG / Event Bus / Workflow DSL

### 快速开始

```bash
pnpm install
# 在项目根目录创建 .env（勿提交），配置 DASHSCOPE_API_KEY、DATABASE_URL、SALES_FIXTURE_DATABASE_URL 等
pnpm -r run build
pnpm dev          # API :3001
pnpm dev:web      # Web :3000
```

**Planning Demo（v0.4）**：

1. **单 tool**：「请查询上个月（last_month）按 revenue 销量第一的产品」→ 右侧 Planning 面板见 1× tool + 1× response；Replay：`user → tool → assistant`；预期 **Widget A** / **12000**。
2. **双 tool step 截断**：「请对比上月和上个季度 revenue 销量第一」→ Plan 含 2 tool steps；`step_tool_quarter` 为 **`truncated`**；仅 1 条 tool snapshot（`last_month`）。

```bash
node scripts/run-planning-demo.mjs
# 或经 Web 代理：node scripts/run-full-stack-demo.mjs
```

审计：`GET /api/sessions/:id/replay` 查看 `planSnapshots` 与 `executionTrace`。

v0.2 Memory 面板：同 Session 约 **8 条消息** 后出现 Active summary（与 v0.4 Planning 正交）。

### 贡献者

- lens68

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
