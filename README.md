# Knolege SFIT — 知识库问答系统

基于 RAG（检索增强生成）架构的知识库问答系统。支持上传 Markdown 文档，自动分块、向量嵌入、存储到 ChromaDB，并通过 LLM 进行智能问答。**支持多轮对话**，对话历史保存在浏览器 localStorage 中，按知识库隔离存储。

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
  1. **场景判断**：检查是否传递了 `kbId`
     - **未选择知识库（全局模式）**：直接使用全局 LLM 配置（兜底配置），跳过向量检索，将用户问题直接发送给 LLM 进行纯对话
     - **选择了知识库**：加载知识库级别的 LLM/Embedding 配置（优先使用知识库配置，为空则回退到全局配置）
  2. **向量检索**（仅在选择知识库时执行）：
     - 使用知识库的 Embedding 配置生成查询向量
     - 在 ChromaDB 中检索 Top-K 相关文档块（带重试机制，最多 3 次，指数退避）
     - 记录检索耗时和结果数量
  3. **上下文构建**（仅在选择知识库时）：
     - 拼接检索到的文档块（包含文件名、chunk 索引、相似度分数）
     - 附加上一轮 AI 回答作为上下文
  4. **LLM 调用**：
     - 使用知识库级别或全局的 LLM 配置构造客户端
     - 调用 Chat Completions API（stream=true），逐 chunk 推送到前端
     - 返回元数据（检索耗时、LLM 调用耗时、检索结果数量）
  5. **降级处理**：向量检索失败时自动降级为普通对话，通过 SSE 发送警告信息
  
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

### 核心改进

- **双模式对话支持**：
  - **全局模式（未选择知识库）**：直接使用全局 LLM 配置进行纯对话，跳过向量检索环节
  - **知识库模式（选择知识库）**：使用知识库级别的 LLM/Embedding 配置（优先）或回退到全局配置，执行完整的 RAG 流程
  
- **知识库级别配置**：每个知识库可独立配置 LLM 服务（base_url/api_key/model）和 Embedding 服务，实现多模型混合部署
  
- **配置优先级规则**：知识库配置 > 全局配置（兜底），确保灵活性的同时保持向后兼容

- **高级 RAG 检索增强**（本次更新重点）：
  - **元数据过滤**：支持按文件名、chunk 索引等元数据字段进行过滤检索
  - **混合检索**：结合向量检索和关键词检索（BM25 简化版），使用倒数融合（RRF）算法合并结果，提高召回率
  - **查询改写**：使用 LLM 优化用户查询，扩展同义词、明确意图，提升检索匹配度
  - **分数阈值控制**：支持设置最低相似度分数（minScore）和距离阈值双重过滤
  - **LLM 重排序**：利用现有 LLM 对检索结果进行智能重排序，无需额外模型，提升 Top-K 结果相关性
  - **可配置检索策略**：通过 `SearchOptions` 接口灵活开启/关闭各项增强功能

- **前端高级检索控制面板**（本次更新重点）：
  - 在对话页面新增⚙️**高级检索设置面板**，用户可通过界面直观控制 RAG 行为
  - **查询改写**、**混合检索**、**LLM 重排序**：复选框开关
  - **返回数量 (Top K)**：滑块调节 (1-20)，默认 4
  - **最低相似度**：滑块调节 (0.0-1.0)，默认 0.3
  - **文件名过滤**：文本输入框，仅检索指定文件的分片
  - 所有参数实时保存到 localStorage，下次自动恢复
  - **使用场景**：
    - 🚀 快速问答：关闭所有增强功能，响应最快
    - 📚 专业查询：开启「查询改写」+「混合检索」
    - 🎯 精确匹配：开启「混合检索」+ 调高「最低相似度」
    - 🔬 深度研究：开启全部功能

- **健壮性设计**：
  - 向量检索和 LLM 调用均带重试机制（最多 3 次，指数退避：1s → 2s → 4s）
  - 检索失败自动降级为普通对话，不中断服务
  - 性能监控：记录检索耗时、LLM 调用耗时、检索结果数量
  
- **中文注释**：所有关键代码段均添加详细中文注释，便于维护和二次开发

### 其他架构特性

- **全局配置**：LLM 和 Embedding 的连接信息全局共享，作为兜底配置。存储在 SQLite `settings` 表，支持运行时修改
- **知识库独立配置**：每个知识库有独立的检索参数（Top K、相似度阈值、距离度量）、分块参数（块大小、重叠大小）和 System Prompt
- **会话管理**：管理后台使用 Cookie + SQLite `admin_sessions` 表认证，Session 有效期 24 小时
- **向量存储**：每个知识库对应 ChromaDB 中的一个 Collection，名称格式为 `kb_<uuid>`
- **OOM 防护**：Markdown 解析大文件自动降级为轻量级正则清洗；Embedding 分批处理（每批 20 个 chunk）；单个文件最多处理 2000 个 chunk

### 高级 RAG 检索流程详解

```
用户提问（选择知识库）
   ↓
【步骤 1】查询改写（可选）
   → 使用 LLM 优化查询：扩展同义词、明确意图、去除冗余
   → 示例："AI 怎么配置" → "人工智能 系统配置 方法 教程"
   ↓
【步骤 2】生成查询向量
   → 使用知识库级或全局 Embedding 配置生成向量
   → 保证与文档入库时使用相同的向量空间
   ↓
【步骤 3】执行检索
   ├─ 向量检索模式（默认）
   │  → ChromaDB 余弦相似度搜索
   │  → 获取 Top-K * 2 候选集（用于后续过滤和重排序）
   │
   └─ 混合检索模式（enableHybridSearch=true）
      → 向量检索：获取 Top-K * 2 向量结果
      → 关键词检索：BM25 简化版计算词频评分
      → 倒数融合（RRF）：合并两种结果，k=60
         公式：RRF Score = Σ 1/(k + rank)
   ↓
【步骤 4】分数阈值过滤
   → 应用 minScore 过滤（默认 0.3）
   → 应用 distance threshold 过滤（向后兼容）
   → 输出过滤后的候选集
   ↓
【步骤 5】LLM 重排序（可选，enableRerank=true）
   → 构建 Prompt：列出候选文档片段（前 200 字符）
   → LLM 判断相关性并返回排序编号
   → 解析并重排结果，补充遗漏文档
   → 截取 Top-K 最终结果
   ↓
【步骤 6】构建上下文
   → 拼接文档内容、文件名、chunk 索引、相似度分数
   → 附加上一轮 AI 回答（如有）
   ↓
【步骤 7】LLM 生成回答
   → 使用知识库级或全局 LLM 配置
   → 流式 SSE 推送至前端
   → 返回元数据（检索耗时、LLM 耗时、结果数量）
```

### 检索配置示例

在知识库配置中可通过 API 或数据库设置以下参数：

```json
{
  "top_k": 5,                    // 返回结果数量
  "similarity_threshold": 0.5,   // 相似度阈值（0-1）
  "distance_metric": "cosine",   // 距离度量：cosine/l2/ip
  "min_score": 0.3,              // 最低相似度分数
  "enable_hybrid_search": false, // 是否启用混合检索
  "enable_query_rewrite": false, // 是否启用查询改写
  "enable_rerank": false,        // 是否启用 LLM 重排序
  "rerank_top_k": 5              // 重排序后返回数量
}
```

### 使用建议

| 场景 | 推荐配置 |
|------|----------|
| **通用问答** | 默认配置即可，响应速度快 |
| **专业术语多** | 开启 `enableQueryRewrite`，扩展同义词 |
| **精确匹配要求高** | 开启 `enableHybridSearch`，结合关键词检索 |
| **结果质量优先** | 开启 `enableRerank`，牺牲速度换取准确性 |
| **大规模知识库** | 调高 `minScore`，减少噪声干扰 |

### 故障排查

- **检索结果为空**：检查 `minScore` 是否过高，尝试降低阈值
- **检索速度慢**：关闭 `enableRerank` 和 `enableQueryRewrite` 减少 LLM 调用
- **结果不相关**：开启 `enableRerank` 或使用混合检索
- **Embedding 不一致**：确保知识库的 `embedding_model` 与文档索引时一致

## 多轮对话功能说明

### 功能特性

- **浏览器本地存储**：对话历史保存在浏览器的 `localStorage` 中，刷新页面或关闭浏览器后不会丢失
- **按知识库隔离**：每个知识库的对话历史独立存储，切换知识库时自动加载对应的历史记录
- **上下文传递**：每次查询时，会将之前的对话历史传递给后端，LLM 可以基于上下文进行连贯的多轮对话
- **自动限制长度**：为避免 localStorage 过大，每个知识库最多保留最近 20 轮对话（40 条消息）

### 数据存储格式

```typescript
// localStorage key 格式
`chat-history-${kbId}`  // 例如：chat-history-abc123

// 存储的数据结构
[
  { role: 'user', content: '第一个问题', timestamp: 1234567890 },
  { role: 'assistant', content: '第一个回答', timestamp: 1234567891 },
  { role: 'user', content: '第二个问题', timestamp: 1234567892 },
  { role: 'assistant', content: '第二个回答', timestamp: 1234567893 },
  // ... 最多保留 40 条消息
]
```

### 工作流程

```
用户提问 1
  ↓
前端显示用户消息
  ↓
发送给后端 (history = [])
  ↓
后端返回 AI 回答
  ↓
前端保存 {用户问题 1, AI 回答 1} 到 localStorage
  ↓
用户提问 2
  ↓
前端显示用户消息
  ↓
发送给后端 (history = [{用户问题 1, AI 回答 1}])
  ↓
后端基于上下文生成回答
  ↓
前端保存 {用户问题 2, AI 回答 2} 到 localStorage
  ↓
... 循环往复，实现多轮对话
```

### 清空历史

点击右上角的垃圾桶图标 🗑️ 可以清空当前知识库的对话历史。

### 切换知识库

当用户切换到不同的知识库时：
1. 自动保存当前知识库的对话状态
2. 从 localStorage 加载目标知识库的历史记录
3. 前端显示对应知识库的对话历史
4. 后续对话将基于新知识库的历史进行

---
