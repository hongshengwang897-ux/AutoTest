# Web 自动化管理系统 - 开发计划

> 版本：v1.0  
> 创建日期：2026-07-24  
> 基于 PRD / 技术架构文档 / 当前原型

---

## 1. 项目概述

### 1.1 项目背景

一个面向 QA/开发团队的 Web 自动化测试管理平台，统一管理自动化脚本、执行引擎、测试报告与告警通知。

### 1.2 核心价值

- 提升自动化测试效率 50%+
- 缩短问题定位时间
- 实现持续交付中的质量门禁

### 1.3 目标用户

- QA 工程师：日常用例编写、执行、报告查看
- 开发工程师：本地验证、回归测试
- 测试经理：质量度量、团队协作

---

## 2. 当前原型功能清单

### 2.1 已完成的原型页面

| 页面 | 文件 | 功能说明 |
|------|------|----------|
| Dashboard 首页 | `src/pages/Dashboard.tsx` | 数据统计卡片、执行趋势、最近执行列表、系统状态 |
| 用例管理 | `src/pages/Cases.tsx` | 用例列表、搜索/筛选、卡片展示 |
| 用例编辑器 | `src/pages/CaseEditor.tsx` | 代码编辑器、配置面板、元素库面板 |
| 录制功能 | `src/pages/Recorder.tsx` | URL 输入、录制控制、步骤时间线、脚本生成 |
| 元素库 | `src/pages/ElementLibrary.tsx` | 元素列表、三种来源管理、详情查看 |
| 执行中心 | `src/pages/Execution.tsx` | 执行队列、实时日志、步骤详情、元素变更检测 |
| 报告中心 | `src/pages/Reports.tsx` | 报告列表、历史筛选 |
| 报告详情 | `src/pages/ReportDetail.tsx` | 步骤详情、截图预览 |
| 环境管理 | `src/pages/Environments.tsx` | 多环境配置、账号管理 |
| 定时调度 | `src/pages/Schedules.tsx` | Cron 规则、启停控制 |
| 告警通知 | `src/pages/Alerts.tsx` | 通道配置、Webhook 设置 |
| 系统设置 | `src/pages/Settings.tsx` | 系统配置 |

### 2.2 元素来源功能（已实现 ✅）

| 来源 | 说明 | 入口 | 实现状态 |
|------|------|------|----------|
| 🎬 录制生成 | 录制测试用例保存时自动提取元素 | Recorder 页面「保存为用例」按钮 | 前端原型 ✅ |
| 🔍 自动识别 | 输入 URL → 启动浏览器（有头/无头可选）→ 悬浮按钮识别 → 去重后导入 | ElementLibrary 页面「自动识别导入」按钮 | **后端+前端联调 ✅** |
| ✏️ 手动添加 | 手动填写元素信息后保存 | ElementLibrary 页面「新建元素」按钮 | 前端原型 ✅ |

### 2.3 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React + TypeScript | 18.x |
| 构建工具 | Vite | 6.x |
| 样式方案 | Tailwind CSS | 3.x |
| 状态管理 | Zustand | 5.x |
| 路由 | React Router | 7.x |
| 图标 | Lucide React | 最新 |

### 2.4 前端+后端项目结构

```
src/                             # 前端 (React + TypeScript)
├── components/                  # 可复用组件
│   ├── Sidebar.tsx
│   ├── TopBar.tsx
│   ├── StatCard.tsx
│   ├── StatusBadge.tsx
│   └── LogTerminal.tsx
├── pages/                       # 页面组件
│   ├── Dashboard.tsx
│   ├── Cases.tsx
│   ├── CaseEditor.tsx
│   ├── Recorder.tsx
│   ├── ElementLibrary.tsx       # 含 AutoImportDialog（已对接后端）
│   ├── Execution.tsx
│   ├── Reports.tsx
│   ├── ReportDetail.tsx
│   ├── Environments.tsx
│   ├── Schedules.tsx
│   ├── Alerts.tsx
│   └── Settings.tsx
├── store/                       # Zustand
│   └── elementStore.ts
├── data/                        # Mock 数据
│   ├── mock.ts
│   └── elements.ts
├── types/
│   └── index.ts
├── lib/
│   └── utils.ts
├── App.tsx
├── main.tsx
└── index.css

api/                             # 后端 (Express + Playwright) ✅ 已实现
├── src/
│   ├── index.ts                 # 服务器入口 + 6 个 REST 端点
│   ├── browser.ts               # 浏览器管理器（有头/无头双实例）
│   ├── inject.ts                # 悬浮按钮注入脚本
│   ├── dedup.ts                 # 选择器去重
│   └── types.ts                 # 类型定义
├── package.json
└── tsconfig.json
```

---

## 3. 开发阶段规划

### Phase 1：前端完善 + API 对接（2-3 周）✅ **已完成**

**目标**：将原型页面与后端 API 对接，实现数据持久化存储。

**完成状态**：2026-07-24 完成。前后端全链路 API 通信已建立，内存数据层已就绪（Phase 2 迁移至 PostgreSQL）。

#### 3.1.1 前端 API 层搭建 ✅

| 任务 | 说明 | 优先级 | 状态 |
|------|------|--------|------|
| 创建 API 请求封装 | 统一 HTTP 请求封装（fetch + Token + 超时 + 错误处理） | P0 | ✅ |
| 定义 API 路由常量 | `src/api/endpoints.ts` 全部端点统一定义 | P0 | ✅ |
| 创建 API 服务层 | 9 个服务模块：cases/executions/reports/elements/environments/schedules/alerts/stats/settings | P0 | ✅ |
| 实现鉴权拦截 | Token 管理、请求头注入、401 处理 | P0 | ✅ |

**产出**：
- `src/api/client.ts` — 统一请求封装（get/post/put/del/upload + params + Token 注入）
- `src/api/endpoints.ts` — 9 模块路由常量
- `src/api/services/` — 9 个 API 服务模块 + index.ts 统一导出

#### 3.1.2 核心页面 API 对接 ✅

| 任务 | 当前状态 | 目标 | 状态 |
|------|----------|------|------|
| Dashboard 数据 | ~~Mock~~ → API | 对接 `/api/stats` 实时数据 + `/api/cases` 分组统计 | ✅ |
| 用例 CRUD | ~~Mock~~ → API | 对接 `/api/cases` 列表 + 搜索 + 标签筛选 | ✅ |
| 执行触发 | ~~Mock~~ → API | 对接 `/api/executions` 实时执行状态 | ✅ |
| 执行日志 | Mock | 对接 WebSocket 实时日志推送（Phase 2） | ⏳ |
| 报告查询 | Mock | 对接 `/api/reports` 历史查询（Phase 2） | ⏳ |
| 环境配置 | Mock | 对接 `/api/environments` CRUD（Phase 2） | ⏳ |
| 定时任务 | Mock | 对接 `/api/schedules` CRUD（Phase 2） | ⏳ |
| 告警配置 | Mock | 对接 `/api/alerts` CRUD（Phase 2） | ⏳ |

**产出**：
- Dashboard：全量切换至 statsService + casesService
- 元素库：全量切换至 elementsService（CRUD + 批量导入 + auto-detect）
- 用例：全量切换至 casesService（列表 + 搜索 + 标签筛选）
- 执行中心：切换至 executionsService（列表 + 实时状态）

#### 3.1.3 元素库功能增强 ✅

| 任务 | 说明 | 优先级 | 状态 |
|------|------|--------|------|
| 元素持久化 | 对接后端 API，元素保存到内存数据层 | P0 | ✅ |
| 元素使用统计 | 用例执行时自动更新元素使用次数 | P1 | ⏳ |
| 元素变更历史 | 记录元素的修改历史版本 | P1 | ⏳ |
| 批量导入/导出 | 支持 JSON/CSV 格式的批量导入导出 | P2 | ⏳ |
| 元素分类管理 | 支持自定义分类/分组管理 | P2 | ⏳ |

#### 3.1.4 录制功能完善 ✅

| 任务 | 说明 | 优先级 | 状态 |
|------|------|--------|------|
| 真实浏览器录制 | 使用 Playwright CDP 实现真实页面录制 | P0 | ✅ |
| 录制回放 | 支持录制过程的回放演示 | P1 | ⏳ |
| 智能等待 | 自动检测页面加载状态 | P1 | ⏳ |
| 元素智能推荐 | 根据录制上下文推荐稳定选择器 | P2 | ⏳ |

**Phase 1 后端产出**（提前完成，供 Phase 2 扩展）：
- `api/src/index.ts` — Express 服务器（端口 3001），挂载 11 个路由模块
- `api/src/data/store.ts` — 内存数据层（8 张表 + 种子数据 + CRUD 辅助函数）
- `api/src/routes/` — 9 个路由模块（cases/executions/reports/elements/environments/schedules/alerts/stats/settings）
- `api/src/browser.ts` — Playwright 浏览器管理器（有头/无头双实例缓存）
- `api/src/inject.ts` — 悬浮按钮注入脚本（DOM 扫描 + 自动回传）
- `api/src/dedup.ts` — CSS 选择器去重引擎

---

### Phase 2：后端核心开发（3-4 周）

**目标**：构建后端服务，实现自动化执行引擎的核心能力。

#### 3.2.1 项目基础搭建

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 初始化 Express + TypeScript 项目 | 配置项目结构、编译选项、环境变量 | P0 |
| 数据库连接池配置 | PostgreSQL 连接池、Redis 连接配置 | P0 |
| 统一错误处理 | 全局异常捕获、错误响应格式化 | P0 |
| 统一响应格式 | 封装标准 API 响应结构 | P0 |
| 请求日志中间件 | 请求耗时、参数记录 | P1 |

#### 3.2.2 数据模型与数据库

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 设计完整数据模型 | 元素库、用例、执行、报告等所有实体 | P0 |
| 编写数据库迁移脚本 | DDL 语句、索引、约束 | P0 |
| 实现数据库访问层 | Repository 模式封装 CRUD 操作 | P0 |
| 种子数据脚本 | 开发环境初始化测试数据 | P1 |

#### 3.2.3 核心业务服务

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 用例服务（CaseService） | 用例 CRUD、版本管理、标签管理 | P0 |
| 执行服务（ExecutionService） | 触发执行、状态管理、日志收集 | P0 |
| 报告服务（ReportService） | 报告生成、截图存储、统计分析 | P0 |
| 环境服务（EnvironmentService） | 环境配置、账号管理、变量注入 | P1 |
| 调度服务（ScheduleService） | Cron 解析、任务分发、启停控制 | P1 |
| 告警服务（AlertService） | 规则匹配、通知发送、渠道管理 | P1 |
| **元素服务（ElementService）** | **元素 CRUD、来源管理、使用统计** | **P0** |

#### 3.2.4 自动化执行引擎

| 任务 | 说明 | 优先级 |
|------|------|--------|
| Playwright Worker 集成 | Node.js 子进程管理、浏览器生命周期 | P0 |
| 任务队列实现 | BullMQ 队列配置、任务状态流转 | P0 |
| 并发控制 | 多 Worker 并行执行、资源调度 | P0 |
| 实时日志推送 | Redis Pub/Sub + WebSocket 日志流 | P0 |
| 截图/视频采集 | 自动截图、失败录像 | P1 |
| **元素自动识别引擎** | **页面 DOM 遍历、元素类型推断、选择器生成、去重** | **P0** | **✅ 已实现** |
| 元素变更检测 | 执行失败时对比选择器差异 | P1 |

#### 3.2.5 API 端点实现

| 模块 | 主要端点 | 说明 |
|------|----------|------|
| 用例 | `GET/POST/PUT/DELETE /api/cases` | 用例 CRUD |
| 执行 | `POST /api/executions` | 触发执行 |
| 执行 | `WS /ws/executions/:id/logs` | 实时日志 WebSocket |
| 报告 | `GET /api/reports` | 报告列表 |
| 报告 | `GET /api/reports/:id` | 报告详情 |
| **元素** | **`GET/POST/PUT/DELETE /api/elements`** | **元素库 CRUD** |
| **元素** | **`POST /api/elements/detect`** | **自动识别页面元素** |
| **元素** | **`POST /api/elements/import`** | **批量导入元素** |
| 环境 | `GET/POST/PUT /api/environments` | 环境配置 |
| 调度 | `GET/POST/PUT/DELETE /api/schedules` | 定时任务 |
| 告警 | `GET/POST/PUT /api/alerts` | 告警配置 |

---

### Phase 3：集成与测试（2-3 周）

**目标**：前后端联调、功能测试、性能优化。

#### 3.3.1 前后端集成

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 本地开发环境配置 | `vite.config.ts` 代理配置、CORS 设置 | P0 |
| 接口联调测试 | 逐个模块 API 对接验证 | P0 |
| 数据流转验证 | 元素库 ↔ 用例 ↔ 执行完整流程 | P0 |
| **录制 → 元素自动入库流程验证** | **核心流程：录制 → 保存 → 元素自动入库 → 用例编辑可引用** | **P0** |
| **自动识别 → 导入流程验证** | **核心流程：输入 URL → 识别 → 选择 → 导入 → 元素库可用** | **P0** |

#### 3.3.2 功能测试

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 核心流程测试 | 登录/搜索/购物车等典型场景端到端测试 | P0 |
| 元素库测试 | 三种来源元素的完整生命周期测试 | P0 |
| 录制功能测试 | 录制 → 回放 → 生成用例 → 元素入库 | P0 |
| 异常场景测试 | 网络中断、超时、页面加载失败 | P1 |
| 兼容性测试 | Chrome / Firefox / Safari 主流浏览器 | P1 |

#### 3.3.3 性能与安全

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 执行性能优化 | 单 Worker 并发数、内存控制 | P1 |
| API 响应优化 | 数据库索引、缓存策略 | P1 |
| 安全加固 | XSS 防护、CSRF Token、输入校验 | P1 |
| 敏感信息加密 | 环境变量、账号密码加密存储 | P0 |

---

### Phase 4：部署与运维（1-2 周）

**目标**：生产环境部署配置和运维文档。

#### 3.4.1 部署配置

| 任务 | 说明 | 优先级 |
|------|------|--------|
| Docker 镜像构建 | 前后端镜像、Nginx 配置 | P0 |
| docker-compose 编排 | 多服务编排（前端/后端/PostgreSQL/Redis） | P0 |
| CI/CD 流水线 | GitHub Actions / GitLab CI 配置 | P1 |
| 环境变量管理 | 不同环境的配置管理 | P1 |

#### 3.4.2 监控与告警

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 健康检查端点 | `/health` 接口、数据库/Redis 连通性检查 | P0 |
| 应用监控 | 错误率、响应时间、执行成功率 | P1 |
| 日志收集 | 结构化日志、ELK/Loki 集成 | P1 |
| 告警规则 | 失败率告警、Worker 离线告警 | P2 |

#### 3.4.3 文档交付

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 部署文档 | 从零部署到生产环境的完整步骤 | P0 |
| API 文档 | Swagger/OpenAPI 生成的接口文档 | P0 |
| 使用者手册 | 功能说明、最佳实践、常见问题 | P1 |
| 运维手册 | 日常运维操作、故障排查指南 | P1 |

---

## 4. 关键技术决策

### 4.1 前端

| 决策项 | 选型 | 理由 |
|--------|------|------|
| 框架 | React 18 + TypeScript | 生态成熟、类型安全 |
| 构建工具 | Vite 6 | 开发体验好、构建快 |
| 状态管理 | Zustand | 轻量、API 简洁 |
| 样式 | Tailwind CSS | 原子化、开发效率高 |
| 代码编辑器 | Monaco Editor (待集成) | VS Code 同款、功能强大 |
| 图表 | Recharts (待集成) | 与 React 深度集成 |

### 4.2 后端

| 决策项 | 选型 | 理由 |
|--------|------|------|
| 运行时 | Node.js 20 LTS | 与前端技术栈统一 |
| 框架 | Express.js + TypeScript | 简洁灵活、社区活跃 |
| 自动化引擎 | Playwright | 微软出品、跨浏览器、性能优秀 |
| 任务队列 | BullMQ | 基于 Redis、功能完善 |
| 数据库 | PostgreSQL 15 | 可靠稳定、功能丰富 |
| 缓存 | Redis 7 | 高性能、多用途 |
| ORM | Prisma / Drizzle | 类型安全、开发体验好 |

### 4.3 元素自动识别方案（已实现 ✅）

| 场景 | 技术方案 | 说明 | 状态 |
|------|----------|------|------|
| 录制时 | Playwright CDP 监听 DOM 事件 | 捕获 click/fill/select 等操作目标 | 规划中 |
| 自动识别 | Playwright 启动浏览器 + JS 注入悬浮按钮 | 有头/无头可选，悬浮按钮触发 DOM 扫描，回传结果 | **✅ 已实现** |
| 选择器生成 | 优先级：data-testid > id > name > nth-of-type | 生成稳定、可维护的选择器 | **✅ 已实现** |
| 去重 | 按 CSS 选择器去重 | 相同 selector 只保留一个，空选择器丢弃 | **✅ 已实现** |

**实现架构**：
- 后端：Express + Playwright，端口 3001
- 前端：AutoImportDialog 组件，4 步流程（url → opening → ready → results）
- 注入脚本：IIFE 创建渐变悬浮按钮，支持 Toast 通知
- 识别类型：button / input / link / image / select / checkbox / radio / container
- 通信方式：浏览器端 fetch → 后端 report 端点 / 前端轮询 elements 端点

---

## 5. 元素库数据模型设计

### 5.1 Element 实体

```sql
CREATE TABLE elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,          -- button, input, link, image, select, checkbox, container
    selector TEXT NOT NULL,
    selector_type VARCHAR(20) NOT NULL, -- css, xpath, text, role
    page VARCHAR(200),
    description TEXT,
    sample_value TEXT,
    tags TEXT[] DEFAULT '{}',
    source VARCHAR(30) NOT NULL,        -- recorder, auto-import, manual
    source_meta JSONB DEFAULT '{}',     -- 来源附加信息：录制ID、URL等
    usage_count INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX idx_elements_type ON elements(type);
CREATE INDEX idx_elements_source ON elements(source);
CREATE INDEX idx_elements_page ON elements(page);
CREATE INDEX idx_elements_tags ON elements USING GIN(tags);
```

### 5.2 元素来源流程

```
┌─────────────────────────────────────────────────────────────────┐
│                         元素来源流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  来源1: 录制生成                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ 开始录制  │───▶│ 操作捕获  │───▶│ 保存用例  │───▶│ 元素入库  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       ↑                ↑                ↑                ↑       │
│  Recorder页面      CDP事件监听     点击「保存」      自动提取     │
│                                                                 │
│  来源2: 自动识别 ✅ 已实现                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ 输入URL   │───▶│ 启动浏览器 │───▶│ 悬浮按钮  │───▶│ 勾选元素  │───▶│ 确认导入  │  │
│  │+选择模式  │    │(有头/无头)│    │ 点击识别  │    │ 去重展示  │    │          │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       ↑                ↑                ↑                ↑                ↑       │
│  ElementLibrary   Playwright      JS注入脚本      按选择器去重    source=auto    │
│  「自动识别」      启动Chromium    DOM遍历回传     人工确认命名     元素入库     │
│                                                                 │
│  来源3: 手动添加                                                  │
│  ┌──────────┐    ┌──────────┐                                   │
│  │ 填写表单  │───▶│ 保存入库  │                                   │
│  └──────────┘    └──────────┘                                   │
│       ↑                ↑                                         │
│  「新建元素」     source=manual                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 里程碑与时间线

```
Week 1-2  ─── Phase 1: 前端完善 + API 对接
           ├── API 层搭建
           ├── 核心页面 API 对接
           └── 状态管理完善

Week 3-4  ─── Phase 2: 后端核心开发
           ├── 项目基础搭建
           ├── 数据模型与数据库
           └── 核心业务服务

Week 5-6  ─── Phase 2 (续): 执行引擎 + API
           ├── 自动化执行引擎
           ├── API 端点实现
           └── 元素识别引擎

Week 7-8  ─── Phase 3: 集成与测试
           ├── 前后端联调
           ├── 功能测试
           └── 性能优化

Week 9    ─── Phase 4: 部署与运维
           ├── 部署配置
           ├── 监控告警
           └── 文档交付
```

---

## 7. 风险与应对

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|----------|
| Playwright 在复杂页面录制不稳定 | 录制功能核心体验下降 | 中 | 增加智能等待、元素检测回退策略 |
| 自动识别生成的选择器不稳定 | 元素复用性差、维护成本高 | 中 | 优先使用 data-testid，实现选择器稳定性评分 |
| 大规模执行性能瓶颈 | 执行超时、资源耗尽 | 中 | 分阶段优化：连接池 → Worker 池 → 分布式 |
| 元素库数据膨胀 | 查询性能下降 | 低 | 实现分类/标签/搜索多级索引，定期归档 |
| 跨浏览器兼容性问题 | 部分页面行为不一致 | 低 | 建立多浏览器测试矩阵，优先 Chrome |

---

## 8. 交付物清单

### 8.1 文档类

| 文档 | 说明 | 交付时间 |
|------|------|----------|
| 产品需求文档 (PRD) | 功能范围、用户故事、验收标准 | 已有 |
| 技术架构文档 | 系统架构、技术选型、数据库设计 | 已有 |
| 开发计划文档 | 本文档 | 已有 |
| API 接口文档 | OpenAPI/Swagger 格式 | Phase 3 |
| 部署运维文档 | 部署步骤、配置说明、故障排查 | Phase 4 |
| 使用者手册 | 功能说明、最佳实践、常见问题 | Phase 4 |

### 8.2 代码类

| 交付物 | 说明 | 交付时间 |
|--------|------|----------|
| 前端完整代码 | React + TypeScript + Tailwind | Phase 1 |
| 后端完整代码 | Express + TypeScript + Playwright | Phase 2 |
| 数据库脚本 | DDL、迁移、种子数据 | Phase 2 |
| Docker 配置 | 镜像文件、docker-compose | Phase 4 |
| CI/CD 配置 | GitHub Actions / GitLab CI | Phase 4 |

### 8.3 演示类

| 交付物 | 说明 | 交付时间 |
|--------|------|----------|
| 原型演示 | 可交互的前端原型 | 已完成 |
| 功能演示视频 | 核心流程操作演示 | Phase 3 |
| 生产环境 Demo | 部署到测试环境的完整系统 | Phase 4 |

---

## 附录 A：术语表

| 术语 | 说明 |
|------|------|
| 用例 (Case) | 一组自动化测试步骤的集合 |
| 执行 (Execution) | 一次用例的运行过程 |
| 元素 (Element) | 页面上的交互元素：按钮、输入框、链接等 |
| 选择器 (Selector) | 定位页面元素的 CSS/XPath 表达式 |
| Worker | 执行自动化任务的工作进程 |
| CDP | Chrome DevTools Protocol，Chrome 浏览器调试协议 |
| BullMQ | 基于 Redis 的任务队列库 |

## 附录 B：参考资料

- [Playwright 官方文档](https://playwright.dev/docs/intro)
- [React 官方文档](https://react.dev/)
- [Zustand 状态管理](https://zustand-demo.pmnd.rs/)
- [BullMQ 任务队列](https://docs.bullmq.io/)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)
