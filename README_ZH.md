# OpenArche [![English](https://img.shields.io/badge/Docs-English-red?style=flat-square)](README.md) [![简体中文](https://img.shields.io/badge/文档-简体中文-blue?style=flat-square)](README_ZH.md)

Claude Code 本地开发者记忆插件。自动从你的对话中学习，在需要时召回相关知识——完全本地，零云端依赖。

## 为什么需要它

OpenArche 解决每个开发者在使用 Claude Code 时都会遇到的三个问题：

1. **没有跨会话记忆** — 每次对话从零开始，同样的背景要反复说
2. **跨项目重复踩坑** — 在 A 项目解决过的问题，到 B 项目又要从头来
3. **没有个性化** — Claude 永远不会记住你的技术偏好、你的决策风格、你已经踩过的坑

OpenArche 默默积累你的本地知识库，在你需要时自动召回正确的知识，一次性解决这三个问题。

## 功能

- **自动提取** — 每次对话结束后，通过 Claude Haiku 自动提取可复用的开发洞察，以 Markdown 文件存储到本地
- **自动注入** — 每次提问前，向量检索相关记忆并作为隐式上下文注入给 Claude（用户不可见，Claude 可见）
- **智能重排序** — 支持本地加权重排序（相似度+质量+时效+频率）或远程 rerank API
- **知识图谱** — 记忆之间双向 links 关联，检索时 BFS 图遍历自动扩展，返回完整上下文
- **状态栏** — 在 Claude Code 状态栏实时显示记忆库总量和最近命中情况

## 快速开始

**1. 添加插件源：**

```
/plugin marketplace add Done-0/openarche
```

**2. 安装插件：**

```
/plugin install openarche
```

然后重载插件：

```
/reload-plugin
```

**3. 运行初始化：**

```
/openarche:setup
```

向导会自动完成所有配置，可选从历史对话批量导入记忆。首次运行会下载本地 embedding 模型（~120MB，仅需一次）。

**4. 完成。** 之后 OpenArche 完全在后台自动运行。

## 更新插件

更新 OpenArche 到最新版本：

```
/plugin update openarche
/reload-plugin
```

## 斜杠命令

| 命令 | 功能 |
|------|------|
| `/openarche:setup` | 初始化插件，对全部历史对话批量提取初始记忆 |
| `/openarche:extract` | 手动触发历史对话提取 |
| `/openarche:config` | 查看或修改配置 |
| `/openarche:save` | 手动保存当前对话中的洞察 |
| `/openarche:list` | 列出最近存储的记忆 |
| `/openarche:search` | 用关键词搜索记忆库 |
| `/openarche:forget` | 按 ID 删除某条记忆 |
| `/openarche:reindex` | 切换 embedding 模型后重建向量索引 |

## 配置

运行 `/openarche:config` 可交互式查看和修改所有配置项。

配置文件位置：`<home>/.claude/openarche/config.json`

```json
{
  "embedding": {
    "provider": "local",
    "localModel": "Xenova/multilingual-e5-small",
    "remoteModel": "",
    "remoteApiKey": "",
    "remoteBaseUrl": ""
  },
  "retrieval": {
    "threshold": 0.73,
    "topK": 3,
    "maxInjectChars": 3000,
    "reranking": {
      "enabled": false,
      "provider": "local",
      "remoteModel": "",
      "remoteApiKey": "",
      "remoteBaseUrl": "",
      "weights": {
        "similarity": 0.7,
        "quality": 0.2,
        "recency": 0.05,
        "frequency": 0.05
      }
    }
  },
  "extraction": {
    "model": "claude-haiku-4-5-20251001",
    "minQualityScore": 0.6,
    "bootstrapConcurrency": 3
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `embedding.provider` | `local` | `local`（本地）或 `remote`（远程）。切换后需运行 `/openarche:reindex` |
| `embedding.localModel` | `Xenova/multilingual-e5-small` | 本地模型，支持 100+ 语言，~120MB |
| `embedding.remoteModel` | `""` | 远程 embedding 模型（如 `text-embedding-3-small`、`BAAI/bge-m3`）|
| `embedding.remoteApiKey` | `""` | 远程 embedding API Key |
| `embedding.remoteBaseUrl` | `""` | 远程 API 地址（支持所有 OpenAI 兼容格式，如 SiliconFlow、DeepSeek）|
| `retrieval.threshold` | `0.73` | 向量相似度阈值，调高减少噪音，调低增加召回 |
| `retrieval.topK` | `3` | 每次最多注入的种子记忆数 |
| `retrieval.maxInjectChars` | `3000` | 每次注入内容的最大字符数 |
| `retrieval.reranking.enabled` | `false` | 是否启用重排序 |
| `retrieval.reranking.provider` | `local` | `local`（本地加权）或 `remote`（远程 rerank API）|
| `retrieval.reranking.remoteModel` | `""` | 远程 rerank 模型（如 `BAAI/bge-reranker-v2-m3`）|
| `retrieval.reranking.remoteApiKey` | `""` | 远程 rerank API Key |
| `retrieval.reranking.remoteBaseUrl` | `""` | 远程 rerank API 地址 |
| `retrieval.reranking.weights.*` | 见配置 | 本地重排序权重（similarity: 0.7, quality: 0.2, recency: 0.05, frequency: 0.05）|
| `extraction.model` | `claude-haiku-4-5-20251001` | 提取用的 Claude 模型 |
| `extraction.minQualityScore` | `0.6` | 低于此分的洞察直接丢弃 |
| `extraction.bootstrapConcurrency` | `3` | bootstrap 并发处理数 |

---

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                      Claude Code CLI                     │
│                                                          │
│   UserPromptSubmit hook           Stop hook              │
│           │                           │                  │
└───────────┼───────────────────────────┼──────────────────┘
            │                           │
            ▼                           ▼
    hooks/prompt.ts              hooks/stop.ts
            │                           │
            │ embed + search            │ spawn detached
            ▼                           ▼
     engine/search.ts         extractor/index.ts
     ┌─────────────┐          ┌──────────────────┐
     │ cosine sim  │          │  Claude Haiku API│
     │ BFS expand  │          │  (ANTHROPIC_*)   │
     └──────┬──────┘          └────────┬─────────┘
            │                          │
            │ stdout XML               │ write .md
            ▼                          ▼
    <arche_context>           engine/writer.ts
    (Claude context)           engine/graph.ts

    hooks/status-line.ts  ←  state.json
```

## 数据流

### 注入流程（每次按 Enter）

```
hooks/prompt.ts
  ├─ 读 transcript → 取最后一条 human 消息
  ├─ embed(prompt)
  ├─ vectorSearch()           # 余弦相似度 > threshold，取 top-K
  ├─ bfsExpand()              # BFS 一层扩展关联记忆
  ├─ 读 .md 文件内容，按 maxInjectChars 截断
  ├─ stdout → <arche_context> XML，注入到用户 prompt 前：
  │     <arche_context matched="N" total="M">
  │       <memory id="..." type="..." score="..." age="Xd" project="..." via="vector">
  │         记忆正文
  │       </memory>
  │       ...
  │     </arche_context>
  └─ 更新 state.json + score/access_count
```

### 提取流程（每次对话结束）

```
hooks/stop.ts
  ├─ 扫描 ~/.claude/projects/ 下所有未处理的 .jsonl
  ├─ 跳过：已在 processed.json 中
  ├─ 跳过：文件 mtime < 12h（对话仍活跃）
  ├─ 跳过：无 tool_use / user 轮数 < 5
  ├─ 每个符合条件的文件写 payload 到临时文件
  ├─ spawn detached extractor/index.ts <tmpFile>
  └─ child.unref() → 主进程立即退出

[后台子进程] extractor/index.ts
  ├─ callHaiku(transcript)    # Anthropic API
  ├─ 过滤 quality < minQualityScore
  ├─ embed(title + trigger_context)
  ├─ cosine >= 0.95 → 跳过（近似重复）
  ├─ cosine >= 0.85 → upsertMemory()   # 覆盖旧 .md + updateMemory()
  ├─ 否则 → writeMemory()              # 写 .md + appendMemory()
  ├─ matchLinksHints() + buildLinks()  # 建双向边
  └─ 更新 state.json(totalMemories)
```

## 存储结构

```
<home>/.claude/openarche/
├── memories/
│   ├── abc123.md        # YAML frontmatter + 自由格式正文
│   └── def456.md
├── index.json           # 元数据 + float32 embedding 向量
├── processed.json       # 已处理 transcript 路径（防重复提取）
├── state.json           # hook ↔ StatusLine 实时状态桥梁
├── models/              # 本地 embedding 模型缓存
└── config.json          # 用户配置
```

`<home>` 是用户主目录：macOS/Linux 下是 `~`，Windows 下是 `%USERPROFILE%`。

## 记忆类型

每条记忆有类型（内容性质）和结构（逻辑形态），两者独立组合：

| 类型 | 含义 |
|------|------|
| `solution` | 某类具体技术问题的解决方案 |
| `decision` | 技术选型决策及推理过程 |
| `pattern` | 可复用的代码或架构模式 |
| `gotcha` | 踩过的坑、反直觉行为、注意事项 |

| 结构 | 含义 |
|------|------|
| `atomic` | 原子事实，一段话能说清 |
| `linear` | 有序步骤（触发场景 → 根因 → 步骤 → 边界条件）|
| `tree` | 条件决策树（场景 → 分支 → 选择 → 重新评估条件）|
| `graph` | 概念网络，通过 links 与多条记忆双向关联 |

## 许可证

MIT
