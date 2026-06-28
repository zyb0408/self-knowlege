# Knolege SFIT — 知识库问答系统

基于 RAG（检索增强生成）架构的知识库问答系统。支持上传 Markdown 文档，自动分块、向量嵌入、存储到 ChromaDB，并通过 LLM 进行智能问答。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18 + TypeScript + Tailwind CSS + Vite |
| 后端 | Express + TypeScript + better-sqlite3 |
| 向量存储 | ChromaDB |
| LLM | OpenAI 兼容 API（支持 llamacpp、Ollama、vLLM 等）|
| Embedding | OpenAI 兼容 Embedding API |

## 项目结构

```
knolege-sfit/
├── server/                         # 后端服务
│   ├── src/
│   │   ├── index.ts                # Express 入口，路由注册
│   │   ├── config.ts               # 全局配置（从 .env 读取）
│   │   ├── db/index.ts             # SQLite 数据库初始化和操作
│   │   ├── llm/
│   │   │   ├── base.ts             # LLM 适配器接口定义
│   │   │   └── openai-compatible.ts # OpenAI 兼容 LLM 实现
│   │   ├── middleware/
│   │   │   └── admin-auth.ts       # 管理员认证中间件
│   │   ├── routes/
│   │   │   ├── admin.ts            # 登录/登出/会话
│   │   │   ├── chat.ts             # 对话流式接口
│   │   │   ├── config.ts           # 全局配置读写 + Embedding 检测
│   │   │   ├── document.ts         # 文档上传/删除
│   │   │   └── knowledgebase.ts    # 知识库 CRUD + 重建索引
│   │   ├── utils/
│   │   │   ├── chunker.ts          # 文本分块（按标题 + 定长）
│   │   │   ├── md-parser.ts        # Markdown 解析器
│   │   │   └── progress.ts         # 进度工具
│   │   └── vectorstore/
│   │       ├── base.ts             # 向量存储接口定义
│   │       └── chroma.ts           # ChromaDB 实现
│   └── package.json
├── web/                            # 前端应用
│   ├── src/
│   │   ├── main.tsx                # 应用入口
│   │   ├── App.tsx                 # 路由配置
│   │   ├── index.css               # 全局样式 + Tailwind
│   │   ├── lib/
│   │   │   ├── api.ts              # API 客户端（类型安全封装）
│   │   │   └── utils.ts            # 工具函数
│   │   ├── context/
│   │   │   ├── admin-context.tsx    # 登录状态管理
│   │   │   └── chat-context.tsx     # 对话状态管理
│   │   ├── hooks/
│   │   │   └── use-local-storage.ts # localStorage Hook
│   │   ├── components/
│   │   │   ├── ChatInput.tsx        # 对话输入框
│   │   │   ├── KnowledgeBaseSelector.tsx # 知识库选择器
│   │   │   ├── MessageList.tsx      # 消息列表
│   │   │   └── SearchDebugPanel.tsx # 检索调试面板
│   │   └── pages/
│   │       ├── AdminDashboard.tsx   # 管理后台（侧边栏布局）
│   │       ├── AdminLoginPage.tsx   # 管理员登录
│   │       ├── KnowledgeBaseForm.tsx # 创建知识库
│   │       ├── KnowledgeBaseDetail.tsx # 知识库详情/编辑
│   │       ├── GlobalSettingsPage.tsx # 全局 LLM/Embedding 配置
│   │       ├── DocumentUpload.tsx   # 文档上传组件
│   │       ├── RetrievalDebugger.tsx # 检索调试工具
│   │       └── UserChatPage.tsx     # 用户对话页面
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── .env                            # 环境变量配置
├── .env.example                    # 环境变量模板
└── package.json                    # Monorepo 根配置
```

## 快速开始

### 1. 环境准备

- **Node.js** >= 18
- **ChromaDB** 向量数据库（Docker 部署，见下方）
- **LLM 服务** 支持 OpenAI 兼容 API（llamacpp / Ollama / vLLM 等）

### 2. 启动 ChromaDB

```bash
docker run -d --name chromadb -p 8574:8000 -v chroma_data:/data chromadb/chroma
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，关键配置项：

```env
# 服务器端口
PORT=3001

# 管理员密码
ADMIN_PASSWORD=admin123

# ChromaDB 连接
CHROMA_HOST=localhost
CHROMA_PORT=8574

# LLM 服务（需要支持 Chat Completions）
DEFAULT_LLM_BASE_URL=http://localhost:8000/v1
DEFAULT_LLM_API_KEY=your-api-key
DEFAULT_LLM_MODEL=gpt-3.5-turbo

# Embedding 服务（需要支持 Embeddings API）
# 如果 LLM 服务同时支持 Embedding（如 llamacpp --embeddings），可不单独配置
DEFAULT_EMBEDDING_BASE_URL=http://localhost:8000/v1
DEFAULT_EMBEDDING_API_KEY=your-api-key
DEFAULT_EMBEDDING_MODEL=text-embedding-ada-002
```

> **注意**：llamacpp 需添加 `--embeddings` 参数才能支持 Embedding 功能。

### 4. 安装依赖

```bash
npm install
```

### 5. 启动开发环境

```bash
# 同时启动前后端
npm run dev

# 或分别启动
npm run dev:server   # 后端 http://localhost:3001
npm run dev:web      # 前端 http://localhost:5173
```

### 6. 使用

1. 打开 `http://localhost:5173/admin/login` — 管理员登录（密码见 `.env` 中 `ADMIN_PASSWORD`）
2. 进入「全局配置」— 配置 LLM 和 Embedding 服务连接信息
3. 进入「创建知识库」— 填写名称、分块/检索参数，上传 `.md` 文件
4. 进入「知识库列表」— 点击知识库可编辑参数、重新索引
5. 打开 `http://localhost:5173/` — 用户对话页面，选择知识库后开始问答

## 管理后台功能

| 页面 | 路径 | 功能 |
|------|------|------|
| 登录 | `/admin/login` | 管理员密码登录 |
| 知识库列表 | `/admin/dashboard` → 列表 | 查看所有知识库，点击进入详情 |
| 创建知识库 | `/admin/dashboard` → 创建 | 新建知识库，支持上传 .md 文件 |
| 知识库详情 | `/admin/knowledge-base/:id` | 编辑参数、上传文档、重新索引、删除 |
| 检索调试 | `/admin/dashboard` → 检索调试 | 手动测试检索结果 |
| 全局配置 | `/admin/dashboard` → 全局配置 | 管理 LLM/Embedding 连接信息 |

## API 接口

### 管理员
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录 |
| POST | `/api/admin/logout` | 退出登录 |
| GET | `/api/admin/session` | 检查会话状态 |

### 全局配置
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 获取全局配置 |
| PUT | `/api/config` | 更新全局配置 |
| POST | `/api/config/test-llm` | 测试 LLM 服务连接 |
| POST | `/api/config/models` | 获取 LLM 可用模型列表 |
| POST | `/api/config/test-embedding` | 测试 Embedding 服务连接 |
| POST | `/api/config/embedding-models` | 获取 Embedding 可用模型列表 |

### 知识库
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/knowledge-bases` | 知识库列表 |
| GET | `/api/knowledge-bases/:id` | 知识库详情（含文档列表）|
| POST | `/api/knowledge-bases` | 创建知识库（支持文件上传）|
| PUT | `/api/knowledge-bases/:id` | 更新知识库配置 |
| DELETE | `/api/knowledge-bases/:id` | 删除知识库 |
| POST | `/api/knowledge-bases/:id/reindex` | 重建索引 |

### 文档
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/knowledge-bases/:kbId/documents` | 文档列表 |
| POST | `/api/knowledge-bases/:kbId/documents` | 上传 .md 文件 |
| DELETE | `/api/knowledge-bases/:kbId/documents/:docId` | 删除文档 |

### 对话
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat/stream` | 流式对话（SSE）|
| POST | `/api/chat/retrieval/debug` | 检索调试 |

## API 逻辑说明

### 管理员认证

- **POST `/api/admin/login`** — 接收密码，与 `.env` 中 `ADMIN_PASSWORD` 比对，成功后生成 UUID token 存入 `admin_sessions` 表，设置 `session` Cookie（httpOnly，路径 `/api`，有效期 24 小时）
- **POST `/api/admin/logout`** — 清除 `session` Cookie
- **GET `/api/admin/session`** — 从 Cookie 中解析 token，查询 `admin_sessions` 表验证是否有效且未过期

### 全局配置

- **GET `/api/config`** — 从 SQLite `settings` 表读取全局配置（LLM Base URL / API Key / Model、Embedding Base URL / API Key / Model、Default System Prompt），首次启动时自动从 `.env` 种子化
- **PUT `/api/config`** — 部分更新 `settings` 表，使用 `INSERT OR REPLACE`
- **POST `/api/config/test-llm`** — 使用全局 LLM 配置构造 `OpenAICompatibleLLM` 客户端，调用 `/models` 端点验证服务可达性，返回连接状态、模型数量和可用性
- **POST `/api/config/models`** — 调用 LLM 服务的 `GET /models` 端点，解析 OpenAI 标准响应格式 `{ data: [{ id: "model-name" }] }`，返回模型 ID 列表
- **POST `/api/config/test-embedding`** — 使用全局 Embedding 配置构造客户端，发送 `['test connection']` 测试文本调用 `/embeddings` 端点，验证服务可达并返回向量维度；失败时根据错误类型给出修复建议（如 "请添加 --embeddings 参数"）
- **POST `/api/config/embedding-models`** — 调用 Embedding 服务的 `/models` 端点获取可用模型列表

### 知识库管理

- **GET `/api/knowledge-bases`** — 查询 `knowledge_bases` 表，关联 `documents` 表统计文档数量和分块总数
- **GET `/api/knowledge-bases/:id`** — 单条查询 + 关联文档列表
- **POST `/api/knowledge-bases`** — 创建知识库记录（LLM/Embedding 配置从全局 settings 读取），自动创建 ChromaDB Collection；如果附带文件，则执行文档索引流程（解析 → 分块 → Embedding → 存 ChromaDB，每 20 个 chunk 一批处理防止 OOM）
- **PUT `/api/knowledge-bases/:id`** — 使用 `COALESCE(?, field)` 实现部分更新，仅更新非空字段；LLM/Embedding 字段同步全局配置
- **DELETE `/api/knowledge-bases/:id`** — 删除 ChromaDB Collection（容错），然后级联删除文档和知识库记录
- **POST `/api/knowledge-bases/:id/reindex`** — 删除并重建 ChromaDB Collection，所有文档标记为 `pending`（需重新上传文件完成索引，因为不存储原始文件）

### 文档管理

- **GET `/api/knowledge-bases/:kbId/documents`** — 按 `indexed_at DESC` 排序返回文档列表
- **POST `/api/knowledge-bases/:kbId/documents`** — multer 内存存储接收 `.md` 文件（最大 10MB，最多 50 个），逐个文件处理：
  1. 创建文档记录（状态 `indexing`）
  2. 解析 Markdown：≤500KB 使用 marked lexer 提取纯文本，>500KB 使用轻量级正则清洗避免 OOM
  3. 按知识库的分块参数切分（最大 2000 个 chunk）
  4. 每 20 个 chunk 一批调用 Embedding API，存 ChromaDB，释放内存
  5. 全部完成后更新文档状态为 `done`，失败则记录错误信息
- **DELETE `/api/knowledge-bases/:kbId/documents/:docId`** — 删除文档记录（ChromaDB 中的数据保留，通过 reindex 清理）

### 对话

- **POST `/api/chat/stream`** — SSE 流式对话：
  1. 如果指定了知识库，查询其检索和 System Prompt 配置
  2. 使用全局 LLM 配置构造客户端
  3. 将用户问题发送到 Embedding API 生成查询向量
  4. 在 ChromaDB 中检索 Top-K 相关文档块
  5. 拼接上下文（文档块 + 上轮回答）到用户 prompt
  6. 调用 LLM Chat Completions API（stream=true），逐 chunk 推送到前端
- **POST `/api/chat/retrieval/debug`** — 返回检索到的文档块及相似度分数，用于调试检索效果

## 数据流

```
用户上传 .md 文件
   → Markdown 解析（≤500KB 用 marked lexer，>500KB 用正则清洗）
   → 文本分块（按标题 + 定长，支持重叠，最大 2000 块）
   → 每 20 块一批 → Embedding API 生成向量 → 存 ChromaDB

用户提问
   → 查询文本 → Embedding → ChromaDB 检索 Top-K 相关块
   → 拼接上下文 → LLM 生成回答（流式 SSE）
```

## 全局配置页交互

全局配置页面（`/admin/dashboard` → 全局配置）提供以下交互：

| 功能 | 说明 |
|------|------|
| **测试连接** | 调用对应服务的 `/models` 或 `/embeddings` 端点验证连通性。绿色 `已连接` 徽章表示成功，红色 `连接失败` 徽章表示失败并显示详细错误和修复建议 |
| **获取模型** | 从服务端拉取可用模型列表。获取成功后 Model 字段从文本框切换为下拉选择器，可直接选择模型 |
| **保存** | 独立保存 LLM / Embedding / System Prompt 配置到 `settings` 表 |

## 创建知识库页交互

创建知识库页面（`/admin/dashboard` → 创建知识库）提供以下交互：

| 功能 | 说明 |
|------|------|
| **Embedding 状态检测** | 页面加载时自动检测 Embedding 服务连通性。可用时显示绿色确认，不可用时显示黄色警告和修复建议 |
| **参数配置** | 分块大小（100-2000）、重叠大小（0-500）、Top K（1-20）、相似度阈值（0-1）、距离度量（Cosine/L2）|
| **文件上传** | 仅 Embedding 可用时开放上传区；不可用时显示警告提示先修复配置 |
| **创建提交** | 同时保存全局配置并创建知识库，文件随表单一并提交并索引 |

## 架构说明

- **全局配置**：LLM 和 Embedding 的连接信息全局共享，所有知识库使用同一套配置。存储在 SQLite `settings` 表，支持运行时修改
- **知识库独立配置**：每个知识库有独立的检索参数（Top K、相似度阈值、距离度量）、分块参数（块大小、重叠大小）和 System Prompt
- **会话管理**：管理后台使用 Cookie + SQLite `admin_sessions` 表认证，Session 有效期 24 小时
- **向量存储**：每个知识库对应 ChromaDB 中的一个 Collection，名称格式为 `kb_<uuid>`
- **OOM 防护**：Markdown 解析大文件自动降级为轻量级正则清洗；Embedding 分批处理（每批 20 个 chunk）；单个文件最多处理 2000 个 chunk
