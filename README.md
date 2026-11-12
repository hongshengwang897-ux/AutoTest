# AutoTest — 自动化测试管理平台

基于 Playwright 的全栈自动化测试管理平台，覆盖 **UI 自动化测试**、**API 测试**、**性能测试** 三大场景，支持定时调度、告警通知、测试计划编排。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + TypeScript + Vite 6 + Tailwind CSS + Zustand + Recharts |
| 后端 | Node.js 22 + Express 4 + SQLite（node:sqlite 内置） |
| 浏览器自动化 | Playwright 1.52（支持 headless/headed） |
| 定时调度 | node-cron 4.6 |

## 快速开始

### 环境要求

- Node.js 22+
- npm 10+

### 安装

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd api
npm install
cd ..
```

### 启动

Windows 下直接双击 `启动.bat`，或手动：

```bash
# 终端 1：启动后端 API（监听 3001）
cd api
npm run dev

# 终端 2：启动前端（监听 5173）
npm run dev
```

- 前端 UI：<http://localhost:5173>
- API 文档：<http://localhost:3001/api/docs>
- OpenAPI 规范：<http://localhost:3001/api/docs/openapi.json>

> 平台无需登录认证，所有接口开放访问（本地/内网使用场景）。

## API 路由总览

| 模块 | 前缀 | 说明 |
|------|------|------|
| UI 用例 | `/api/cases/*` | 测试用例 CRUD、执行、取消 |
| 执行记录 | `/api/executions/*` | 执行结果、日志、截图、Allure 导出 |
| 报告 | `/api/reports/*` | 测试报告 |
| 元素库 | `/api/elements/*` | UI 元素选择器管理 |
| 环境 | `/api/environments/*` | 测试环境配置 |
| 定时调度 | `/api/schedules/*` | Cron 定时任务 |
| 告警 | `/api/alerts/*` | 通知规则 |
| 统计 | `/api/stats` | 统计看板 |
| 设置 | `/api/settings/*` | 系统设置 |
| 录制 | `/api/recorder/*` | 录制器（浏览器操作） |
| 模块 | `/api/modules/*` | 目录树管理 |
| 自动检测 | `/api/auto-detect/*` | 浏览器元素检测 |
| API 测试 | `/api/api-tests/*` | API 用例、集合、执行 |
| 性能测试 | `/api/performance-tests/*` | 性能场景、压测执行 |
| 测试计划 | `/api/campaigns/*` | Campaign 编排 |
| OpenAPI | `/api/docs/*` | API 文档 |

## 数据库

SQLite 单文件（`api/data/app.db`），共 **15 张表**：

| 表 | 说明 |
|----|------|
| `cases` | UI 测试用例 |
| `executions` | 执行记录 |
| `reports` | 测试报告 |
| `elements` | 元素选择器库 |
| `environments` | 测试环境 |
| `schedules` | 定时任务 |
| `alerts` | 告警规则 |
| `modules` | 模块目录树 |
| `api_cases` | API 测试用例 |
| `api_executions` | API 执行记录 |
| `api_collection_runs` | API 集合执行 |
| `performance_scenarios` | 性能测试场景 |
| `performance_runs` | 性能执行记录 |
| `campaigns` | 测试计划 |
| `settings` | 全局配置（key-value） |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端端口 | `3001` |

## 构建

```bash
# 前端
npm run build

# 后端
cd api && npm run build
```

## 项目结构

```
├── api/                  # 后端
│   ├── src/
│   │   ├── routes/       # 路由模块（14 个）
│   │   ├── data/db.ts    # 数据库（SQLite + 建表 + 种子数据）
│   │   ├── browser.ts    # Playwright 浏览器控制
│   │   ├── scheduler.ts  # 定时调度
│   │   ├── case-execution.ts  # 用例执行引擎
│   │   └── openapi.ts    # OpenAPI 自动生成
│   └── data/app.db       # SQLite 数据库文件
├── src/                  # 前端
│   ├── pages/            # 页面组件（14 个）
│   ├── components/       # 通用组件
│   └── store/            # Zustand 状态管理
├── local-runner-package/ # 本地执行器（远程节点跑用例）
└── 启动.bat              # 一键启动前后端
```
