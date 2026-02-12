# feat/cloud_server 合并 remote main 说明（2026-02-12）

## 1. 合并背景

- 本次目标：将 `origin/main` 合并到本地 `feat/cloud_server`，并保留 Bustly 产品化改造逻辑。
- 约束：不改动远程 `main`、不改动远程 `feat/electron`，仅在 `feat/cloud_server` 完成合并与冲突处理。

## 2. 基线与提交信息

- 合并前 `feat/cloud_server` 基线：`0412c4d08`
- 参与合并的 `origin/main` 提交：`b094491cf`
- 合并提交（本地）：`5883a3683ec024908f4ef77c5d8da9c52242f999`

验证结果：

- `git merge-base --is-ancestor origin/main feat/cloud_server` 返回 `0`
- `git rev-list --left-right --count feat/cloud_server...origin/main` 为 `104 0`

结论：`origin/main` 在当时已完整纳入 `feat/cloud_server`。

## 3. 变更规模

对比区间：`0412c4d08..5883a3683`

- 文件变更：`1988`
- 代码变更：`+166,323 / -28,307`

按顶层目录（文件数）统计：

- `src`: 895
- `docs`: 536
- `extensions`: 244
- `ui`: 120
- `apps`: 71

## 4. main 合并带来的主要新增能力

### 4.1 Web 控制台能力增强

- 新增 Agents Dashboard（代理总览、文件管理、工具策略、技能、频道、Cron 入口）
- 新增 Usage Dashboard（Token/成本/时序/会话日志分析）
- 控制台路由与渲染能力扩展，支持更多后台控制面板

### 4.2 Gateway / Agent 管理增强

- 新增 `agents.create / agents.update / agents.delete`
- 新增 `agents.files.list / agents.files.set`
- 通过 Gateway 可对代理生命周期和关键工作区文件进行集中管理

### 4.3 Memory 体系升级

- 引入可选 QMD backend（启动、更新、队列、容错等机制）
- 增强语义检索与索引稳定性
- 新增/完善 Voyage embeddings 能力（含 batch 路径）

### 4.4 Cron 调度增强

- delivery 语义规范化（如 `announce` / `none`）并兼容历史字段
- 增强 one-shot 任务行为、避免重复触发
- 增强 timer 重入保护、错误回退与调度稳定性

### 4.5 渠道与插件生态扩展

- Feishu/Lark 插件能力增强（频道与文档/权限相关工具）
- 新增 IRC 一等频道插件
- Telegram/Discord/Slack/WhatsApp 等渠道的大量稳定性与线程/路由修复

### 4.6 模型与 Provider 扩展

- 扩展 xAI Grok、Together、Qianfan、Cloudflare AI Gateway、Custom Provider 等支持
- `web_search` 增加 Grok provider
- Onboarding/鉴权选项覆盖更多 provider 场景

### 4.7 安全增强

- 新增技能/插件代码安全扫描能力
- SSRF 防护、凭据保护、allowlist/owner 权限、gateway scope 约束增强

### 4.8 CLI 与工程化优化

- 路径解析增强（含 `OPENCLAW_HOME`、`OPENCLAW_STATE_DIR` 场景）
- `logs` 支持本地时区显示
- 构建链路与 CI 流程进行提速与稳定性优化

## 5. 与 Bustly 产品化分支相关的保留项（冲突处理重点）

本次冲突处理明确保留了 Bustly 侧关键逻辑，重点包括：

- 状态目录与文案：`~/.bustly` 相关路径语义
- Bustly 登录/OAuth 流程相关入口与展示
- Bustly 品牌化 UI 关键部分
- 与产品链路相关的 chat/gateway 关键行为未被主线覆盖掉

## 6. 结论

本次合并属于“主线能力大规模同步 + 产品化逻辑保留”的结果：

- `main` 新特性已合入
- Bustly 产品改造主干逻辑已保留
- 后续可在 `feat/cloud_server` 上继续进行产品功能升级
