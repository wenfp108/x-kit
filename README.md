# x-kit

> X (Twitter) VIP 账号监控 + 推文采集系统

## 架构

```
dev-accounts.json (47 个 VIP 目标)
         │
    ┌────▼──────────────────────┐
    │     fetch-sniper.ts       │  每 4 小时
    │  按标签配额抓取 VIP 推文   │
    │  传播加权排序 → Top N      │
    │  增长追踪 + Checkpoint     │
    └───────────────────────────┘
         │
    ┌────▼──────────────────────┐
    │     sync-to-bank.ts       │  Sniper 完成后自动触发
    │  tweets/*.json → Central-Bank/twitter/
    └───────────────────────────┘
         │
    ┌────▼──────────────────────┐
    │   refinery-erngine (下游)  │
    │   AI 审计 + 信号生成       │
    └───────────────────────────┘

    ┌───────────────────────────┐
    │   fetch-tweets.ts         │  每 30 分钟
    │   首页时间线采集           │
    └───────────────────────────┘

    ┌───────────────────────────┐
    │   post-tweet.ts           │  每天 00:00
    │   自动发推（语录卡片）     │
    └───────────────────────────┘
```

## 核心流程

### 1. Sniper（主力采集）

```
读取 dev-accounts.json → 获取 47 个 VIP 目标
  → 对每个目标：getUserTweets (count=40)
  → 过滤最近 2 天推文
  → 传播加权评分排序
  → 按标签配额取 Top N
  → 增长追踪（与上次数据对比）
  → 每 5 人 Checkpoint 保存
  → 写入 tweets/YYYY-MM-DD.json
```

### 2. 传播加权评分

```python
score = views + (likes × 5) + (replies × 20) + (bookmarks × 50) + ((retweets + quotes) × 100)
```

互动权重：bookmarks > retweets/quotes > replies > likes > views

### 3. 标签配额系统

每个 VIP 根据标签决定取几条推文：

| 标签 | 配额 | 说明 |
|---|---|---|
| Science | 8 | 高价值，多取 |
| Tech / Finance / Geopolitics | 5 | 核心领域 |
| General | 4 | 默认 |
| Economy / Politics / Crypto | 3 | 中等 |
| Meme | 2 | 低优先 |
| Noise | 1 | 最少 |

### 4. 增长追踪

每次采集与历史数据对比，计算增量：
- `growth`：本次采集相对上次的增量（views, likes, retweets, replies）
- `peakGrowth`：记录单次最大增量时刻

## Workflow 链路

| Workflow | 触发 | 作用 |
|---|---|---|
| `sniper-action.yml` | 每 4 小时 | 主力采集：更新账号 ID + 抓取推文 |
| `bank-sync-watchdog.yml` | Sniper 完成后 | 自动同步到 Central-Bank |
| `get-home-latest-timeline.yml` | 每 30 分钟 | 首页时间线采集 |
| `daily-get-tweet-id.yml` | 每天 00:00 | 更新 VIP 用户 Profile |
| `post-twitter-daily.yml` | 每天 00:00 | 自动发推 |
| `update-accounts.yml` | 手动 | 批量更新账号 ID |

## 数据存储

| 目录 | 内容 |
|---|---|
| `accounts/` | VIP 用户 Profile（restId、粉丝数等） |
| `tweets/` | 每日推文数据，按日期命名（YYYY-MM-DD.json） |
| `dev-accounts.json` | VIP 目标列表 + 标签配置 |

## 关联仓库

| 仓库 | 用途 |
|---|---|
| [x-kit](https://github.com/wenfp108/x-kit) | 本仓库。X 数据采集 |
| [Central-Bank](https://github.com/wenfp108/Central-Bank) | 数据存储（twitter/ 目录） |
| [Refinery-Engine](https://github.com/wenfp108/refinery-erngine) | 下游：AI 审计 + 信号生成 |

## 环境变量

| 变量 | 用途 |
|---|---|
| `AUTH_TOKEN` | X 认证 Token（登录态，用于发推、抓时间线） |
| `GET_ID_X_TOKEN` | X Guest Token（用于获取用户 ID） |
| `GH_TOKEN` | GitHub PAT（Actions 提交用） |

## 技术栈

- **Runtime**: Bun
- **Language**: TypeScript
- **X API**: twitter-openapi-typescript（非官方，cookie 认证）
- **自动化**: GitHub Actions

## 本地运行

```bash
bun install

# 获取用户 ID
GET_ID_X_TOKEN=xxx bun run scripts/index.ts

# 抓取推文
AUTH_TOKEN=xxx bun run scripts/fetch-sniper.ts

# 抓取首页时间线
AUTH_TOKEN=xxx bun run scripts/fetch-tweets.ts
```
