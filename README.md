# OKX · Trading Blueprint 2025 — Agent 驱动的 H5 年度账单

一个以 **Agent 交互** 为叙事主线的移动端年度账单活动页：用户在智能体输入框里用 `/` 选中 OKX 技能、
发出「看看我的 2025 年度账单」，随后智能体「思考 → 调用 okx-trade-mcp 工具 → 呈现结果」逐章展开全年数据，
中间穿插 Human-in-the-loop（权限确认、分支选择、生成人格卡片），舞台层同步渲染数据图表、GPU 粒子与 ASCII 场。

## 运行

无构建步骤，纯原生 ES Module + 本地化的 three.js。任何静态服务器都能跑：

```bash
npm run dev          # python3 serve.py 4187 —— 带 no-store 头的静态服务器，改完即刷即见
# 电脑：http://localhost:4187/
# 手机：同一 Wi‑Fi 下打开 http://localhost:4187/phone.html 扫码（或直接输局域网地址）
```

`serve.py` 对局域网开放（0.0.0.0），macOS 首次会弹防火墙提示，允许即可。
（Claude Code 内置浏览器可直接用 `.claude/launch.json` 里的 `annual-report` 配置预览。）

### 调试参数

| 参数 | 作用 |
|---|---|
| `?from=N` | 跳过入口演示，直接从第 N 章开始（0 = 会话/授权，1 = 起点 … 12 = 人格） |
| `?auto=0` | 关闭自动播放，只靠点击/空格/→ 推进 |
| `?lang=en` / `?lang=zh` | 强制语言（默认跟随浏览器） |

例：`http://localhost:4187/?from=5&lang=en&auto=0`

## 故事线（12 章 + 会话）

```
入口   Composer：输入 / → 选中 okx-year-in-review → 提问 → 发送
       ↳ 发送瞬间输入内容"起飞"追进对话流变成用户气泡；输入框收成 34px 状态条（MCP 状态 + 技能 chip）
00 SESSION      mcp.connect → 167 tools / 11 modules → 「已连接 · 只读回放」（不弹权限请求，避免用户误以为是真实授权）
01 GENESIS      account_profile      与 OKX 同行 N 天（年份时间轴）
02 FIRST SIGNAL spot_fills           1月1日 22:50 首笔 BTC 成交（终端回执）
03 ACTIVITY     account_bills        315 活跃天 / 87 笔（年度热力格）
04 BEST TRADE   trade_pnl            10月10日 +1,223 USDT（累计盈亏曲线 + 高亮）
05 HARVEST      account_pnl          21,887 USDT · +138% · 超过 82% 用户（百分位量尺）
                ↳ 「接下来先看哪一项？」 交易量 / 赚币 / 机器人                   ← HITL 分支决定 06-08 顺序
06 VOLUME       account_volume       1,998,887 USDT · spot / futures / dex（横向条）
07 EARN         earn_positions       申购 1,234 → 收益 988（累计 sparkline）
08 BOTS         bot_orders_history   网格机器人 +2,521（网格线 + 买卖点）
09 PEAK         asset_valuation      8月31日 资产峰值 21,887 · TOP 30%（估值曲线）
10 FLOW         funding_flow         充值 21,887 / 提现 2,521 / 留存
11 TRADING DNA  analyze_behavior     五维雷达（自动化 / 稳定性 / 收益 / 风控 / 多样性）
12 PERSONA      「正在解析你的蓝图…」 → ◈ 生成人格卡片？[生成 / 暂不]           ← HITL
                网格建筑师 · 特质 · 4 项核心数据 · 保存卡片 · Agent Trade Kit CTA
                状态条右侧出现「继续追问」，点击后输入框才滑回来
```

### 每章的叙事节奏

每一章不是一次性甩出结果，而是按 **思考 → 工具调用 → 三个叙事节拍** 展开：agent 每说一句，舞台只揭示一层。

```
think   3 行推理逐条出现（约 2 s）→ 折叠为「思考了 2.0 秒」
tool    工具行 spinner → ✓ 延时 → 结果摘要（点击可展开 JSON）
beat 1  图表先画（曲线描线 / 热力格逐列点亮 / 网格线成交点）      + 第一句叙述
beat 2  大数字滚动、高亮点弹出、标签胶囊出现                       + 第二句叙述
beat 3  结论句                                                      （有时伴随粒子形态变化）
next    「继续」标签出现，9 s 自动推进，也可点击舞台 / 空格 / → 立即继续
```

一章约 20–25 s，全程约 5 分钟。节拍文案在 `copy.js` 的 `chN.b1 / b2 / b3`，揭示顺序在 `main.js` 各 `chXxx()` 的 `beat()` 调用里，可自由增减。

工具名沿用 [okx/agent-trade-kit](https://github.com/okx/agent-trade-kit) 的 `{module}_{action}` 命名习惯，
技能列表用的是仓库中真实的 `okx-cex-*` skills，另加一个活动专用的 `okx-year-in-review`。

## 目录

```
index.html            页面骨架（顶栏 / 舞台 / 智能体控制台 / 分享弹层）
serve.py              开发用静态服务器（no-store、对局域网开放）；phone.html 生成手机访问二维码
src/main.js           故事引擎：agent 控制台 API（think / tool / say / choice / approval）、场景、章节、自动播放
src/copy.js           中英文案（{var} 占位）+ 技能列表
src/data.js           年度数据（来自去年 demo）+ 确定性合成序列（热力格 / 曲线 / 网格）
src/charts.js         SVG/HTML 图表：折线+区域、横向条、雷达、年度热力格、网格机器人、资金流、量尺、sparkline、时间轴
src/share.js          人格分享卡片（Canvas → PNG）
src/styles.css        设计 token（okd 深色语义：#bcff2f 品牌绿 / 黑 / 中性灰）与全部样式
src/fx/ascii.js       ASCII 场背景（字形图集 + 扫掠光带 + storm 模式）
src/fx/particles.js   three.js GPU 粒子：形态变形（sphere / ring / grid 品牌方块 / wave / helix / lattice / peak…）、指针推挤
src/fx/text.js        decrypt 解密文字、打字机、数字滚动、tween、格式化
vendor/three.module.js
```

## 替换真实数据

只改 `src/data.js` 里的 `report` 对象即可；`buildSeries()` 会按 `activeDays` / `peak` / `best` 生成一致的序列，
接真实接口时把对应序列换成真实的每日数据即可。文案在 `src/copy.js`，变量名与 `report` 字段一一对应。

## 设计要点

- **色彩**：仅品牌绿 + 黑 + 中性灰；图表全部单色系（强调 + 去强调灰），文字永远用文字 token 而非数据色。
- **图表**：细描边（2px 线、≤14px 条）、发丝网格、4px 圆角数据端、单轴；所有图表支持 hover / 点按 tooltip。
- **动效**：三层——ASCII 场（章节切换扫掠、解析时 storm）、粒子（每章一种形态、指针推挤、终章聚成品牌方块）、
  文字（解密揭示 / 打字机 / 滚数）。尊重 `prefers-reduced-motion`。
- **HITL**：分支选择改变章节顺序、人格卡片需确认生成、终章可继续追问。刻意不做模拟的权限请求：用户会当真，徒增负担。
