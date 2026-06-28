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
| POST | `/api/config/test-embedding` | 测试 Embedding 服务连接 |

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

## 数据流

```
用户上传 .md 文件
   → Markdown 解析（marked 库去除语法标记）
   → 文本分块（按标题 + 定长，支持重叠）
   → Embedding API 生成向量
   → 存储到 ChromaDB

用户提问
   → 查询文本 → Embedding → ChromaDB 检索 Top-K 相关块
   → 拼接上下文 → LLM 生成回答（流式 SSE）
```

## 架构说明

- **全局配置**：LLM 和 Embedding 的连接信息全局共享，所有知识库使用同一套配置
- **知识库独立配置**：每个知识库有独立的检索参数（Top K、相似度阈值、距离度量）、分块参数（块大小、重叠大小）和 System Prompt
- **会话管理**：管理后台使用 Cookie + SQLite Session 认证
- **向量存储**：每个知识库对应 ChromaDB 中的一个 Collection
