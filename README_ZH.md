# OpenArche [![English](https://img.shields.io/badge/Docs-English-red?style=flat-square)](README.md) [![简体中文](https://img.shields.io/badge/文档-简体中文-blue?style=flat-square)](README_ZH.md)

OpenArche 是一个面向 Claude Code 的 harness-first 工程插件，处理非轻量任务。它会阻止复杂任务在计划、验证、评审和收尾还没显式完成前就结束。

## 功能

- `任务分级`：判断任务保持轻量还是进入 harness
- `基于 embedding 的路由`：使用当前配置的 embedding 后端区分普通问答和执行型任务，不依赖语言关键词表
- `持续会话`：只有真正进入执行后才会在 `.openarche/sessions/<task-id>/state.json` 下落任务状态
- `阶段门禁`：让验证、评审、维护持续保持显式状态
- `上下文注入`：补充当前任务状态、接管理由和相关本地知识
- `知识召回`：优先复用仓库内知识，再补充全局知识
- `后台收尾`：在任务结束后沉淀可复用经验

## 安装

1. 添加 marketplace：

```text
/plugin marketplace add Done-0/openarche
```

2. 安装插件：

```text
/plugin install openarche
```

3. 重载插件：

```text
/reload-plugin
```

4. 运行初始化：

```text
/openarche:setup
```

如果使用本地 embedding，首次成功运行时可能需要联网下载模型文件。如果你更希望走 API 方式，可以在 `/openarche:config` 里切到 `remote`。

## 工作方式

1. 像平时一样向 Claude Code 提任务。
2. 轻量任务保持轻量；非轻量任务会先注入 harness 上下文，只有显式执行或默认情况下真正发生写入活动后才会建立 `.openarche/sessions/<task-id>/state.json` 任务会话。
3. 系统会告诉 Claude Code 为什么这个任务被接管、还差哪些阶段、本地有哪些相关知识。
4. 状态栏和会话状态会持续显示还没完成的环节，避免任务过早结束。
5. 验证、评审、维护会一直保持打开状态，直到当前会话状态和证据目录里记录了所需证据。
6. 任务结束时，系统会对当前会话做收尾，并为本次 transcript 排队沉淀知识。

## 命令

| 命令 | 功能 |
|---|---|
| `/openarche:setup` | 初始化自动接管、harness 会话和可选的历史知识导入 |
| `/openarche:config` | 查看或修改按能力分组的配置 |
| `/openarche:plan` | 生成包含目标、验收标准和明确任务覆盖的执行计划 |
| `/openarche:run` | 把计划转成执行清单 |
| `/openarche:validate` | 定义浏览器验证和任务验证要求 |
| `/openarche:observe` | 定义可观测性查询和排查目标 |
| `/openarche:review` | 驱动自审、本地智能体评审、云端智能体评审和修复循环 |
| `/openarche:maintain` | 运行维护与漂移清扫流程 |
| `/openarche:knowledge-search` | 检索可复用工程知识 |
| `/openarche:knowledge-save` | 显式保存可复用工程知识 |
| `/openarche:knowledge-reindex` | 在向量模型变化后重建知识索引 |

## 配置

配置文件位置：

```text
<home>/.claude/openarche/config.json
```

- `knowledge.embedding.provider`：`local` 或 `remote`
- `orchestration`：自动注入、延迟落盘和显式命令策略
- `knowledge.embedding.localModel`：仅在 `local` 时使用
- `knowledge.embedding.remoteModel`、`knowledge.embedding.remoteApiKey`、`knowledge.embedding.remoteBaseUrl`：仅在 `remote` 时使用
- `knowledge.retrieval`：召回阈值、召回数量和注入预算
- `knowledge.extraction`：提取模型和并发度
- `execution`：隔离策略和基准分支
  OpenArche 默认只记录隔离执行方案，不会自动在你的仓库里创建 git worktree 或切换分支。
- `validation.browser`：浏览器证据要求
- `observability`：日志、指标、链路要求
- `review`：自审、本地智能体评审、云端智能体评审、修复轮次
- `maintenance`：质量清扫和漂移清扫

如果修改了向量提供方式或模型，需要运行：

```text
/openarche:knowledge-reindex
```

## 运行时目录

全局 OpenArche 状态位于：

```text
<home>/.claude/openarche/
├── config.json
├── state.json
├── capture-log.json
├── decision-log.jsonl
├── prototype-cache.json
├── index.json
└── knowledge/
```

仓库级运行时状态位于：

```text
<repo>/.openarche/
├── sessions/
│   └── <task-id>/
│       ├── state.json
│       └── evidence/         # 只有真正落证据时才会创建
└── knowledge/
    ├── index.json
    └── <entry-id>.md
```

- 会话状态、validation、review、maintenance 都在 `sessions/<task-id>/state.json` 内。
- 机械化 review 的命令输出会在真正产生证据后落到 `sessions/<task-id>/evidence/`。
- 仓库任务的 closeout 会把可复用知识写入仓库内 `.openarche/knowledge/`。
- Prompt 检索时会优先用仓库知识，再回退到全局知识库。
- `capture-log.json` 里保存的是 transcript 指纹和 `closeout:<fingerprint>` 队列项，不再保存原始路径。

## 架构

```text
src/
├── product/             # 产品清单与能力成熟度
├── planning/            # 执行计划与验收标准
├── execution/           # 隔离任务会话定义
├── validation/          # 验证协议与浏览器证据门禁
├── observability/       # 日志、指标、链路证据门禁
├── review/              # 机械评审门禁与修复循环状态
├── maintenance/         # 任务收尾与后续清理状态
├── orchestration/       # 流程编排、会话同步、Claude 上下文组装
├── knowledge/           # 提取、索引、检索、写入
└── integrations/claude/ # Claude Code 适配层
```
