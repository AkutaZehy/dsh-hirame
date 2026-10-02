# 设计 / Design

Hirame 的设计定稿：要实现什么、借鉴了什么、以及它如何工作。

> The design doc is not provided in other languages.

## 为什么做这个插件

现在（2026-10）的 AI 能力很强，但上下文到了约 150-300K 的时候，智力就会出现一定的衰退，为了实现长上下文的稳定性，需要将工作区的内容跨会话交付，并对上下文执行压缩。一种手段是像 [ranxianglei\/billion-context](https://github.com/ranxianglei/billion-context) 这样，但它有一个明显的问题：需要启动一个额外的进程，这种操作较为繁琐；另一方面，它没有提供跨会话交付工作内容的能力。

在近几个月的实践中，主要尝试了如 [memory-graph](https://github.com/memory-graph/memory-graph) 等诸多记忆组件，其中，[zai-org/ZCode](https://github.com/zai-org/ZCode) 的记忆管理体验较好。考虑到 ZCode 最近报出的信用问题，而 dsh 侧社区的几套记忆插件有些笨重了，因此做了这个移植插件。

Hirame（鮃）是“鱼”系列 repo 的第一作，本身无特殊含义，因为命名为 memory 的插件实在太多了，取一个冷门的鱼名应该不大可能重复。

## 参考与取舍

### ZCode

ZCode 的记忆体系由五部分组成：

- **格式契约**：system prompt 里的一段文本，约定 frontmatter、`[[链接]]` 和索引纪律
- **索引注入**：MEMORY.md 每会话注入上下文，200 行 / 25KB 封顶，超限带截断警告
- **原生读写**：全走模型原生文件工具，没有任何专用记忆工具
- **后台沉淀**：会话边界后 extraction subagent 拍快照、对既有记忆查重、最多五轮、写权限锁死在记忆目录内
- **subagent 持久记忆**：每个 agent 独立目录，同一套 md + 索引契约

目录按项目分桶：`~/.zcode/cli/memories/projects/<slug>-<hash>/memory`，桶名取工作区路径 sha256 的前 16 位。

设计理念是「机制极薄，模型是一等公民」：harness 只负责把索引放进上下文、在后台兜底沉淀这两件事，其余判断（读哪篇、写什么、何时删）全交给模型；纪律不在代码里，而在契约面上用 prompt 文本约定。文件即数据，人可以直接读改、可以 git。这套低保真契约恰好是跨 harness 的最低公分母——任何能读文件的工具都能接入，hirame 要做的只是让 dsh 也说这门方言。

### 其他的参考

[meow-memory](https://github.com/Phant0Meow/dsh-meow-memory) 走引擎路线，是「引擎是一等公民、模型经受限工具写结构化条目」的代表，也是 dsh 生态里完成度最高的记忆插件：

- 七层 SQLite（soul / user / project / fact / lesson / topic / rules），每工作区一库
- 静态 guide + 首轮快照注入；第二轮起每条用户消息做关键词命中（idf × 艾宾浩斯衰减 × importance 打分）
- memory_* 七个专用工具、反思与 dream 整理（峰时抑制）、压缩后重注入、折叠 UI

[hr98w/dsh-memory](https://github.com/hr98w/dsh-memory) 与本项目路线最近：Claude Code 式 md 索引 + 渐进披露，配 Codex 式手动 Session 整理、Web 管理页和 LoCoMo-10 评测（baseline 2.60% → 记忆 73.05% → 加整理 77.60%）。差别在存储是自有方言（GLOBAL.md + 自有 workspace key），不与 ZCode 共库。

生态里还有 dsh-memoir（BM25 + 有界热记忆）、dsh-mnemon / dsh-mnemon-gc（可组合视图 + 治理）、dsh-memory-evolve（五轨 + 自进化）等，多数是有状态引擎路线；dsh-taskboard 与 dsh-usage-stats 虽非记忆系统，但是插件骨架与宿主协议的活样本。

### 取舍

| 决定 | 对象 | 理由 |
|---|---|---|
| 整块移植 | ZCode 的契约文本、索引格式化、目录哈希算法 | 共享存储的前提是两边算出同一个目录、认同一份格式，不能有偏差；移植部分遵循其原许可（Apache-2.0），归属见 README License 节 |
| 机制借鉴 | meow 的三个注入机制：常量契约段（order 130）、首轮独立 snapshot 消息、`compaction/end` 触发的重注入 | 在真实宿主上验证过的 KV 缓存友好模式 |
| 整体舍弃 | meow 的 SQLite 七层、关键词命中、BM25、importance / 艾宾浩斯、memory_* 工具面、dream / 反思、Web UI | 平文件插件自己不持有状态，记忆系统的事故基本都出在有状态引擎层；73 行索引常驻已是粗粒度推送，量级没到不引入引擎 |
| 骨架照抄 | dsh-taskboard / dsh-usage-stats 的导出形状、client ModuleLoader 协议、schemastery 用法 | 真实宿主上跑着的活样本 |
| 留作 v2 | hr98w 的评测方法（LoCoMo 基准） | 公开发布需要数字背书 |

## 插件的工作流

启动时做一次：解析记忆根，按三级回退——

1. patch 里的 `memoryRoot`
2. 环境变量 `DSH_HIRAME_MEMORY_ROOT`
3. 按 ZCode 规则从会话工作目录自动计算

每个会话：

1. 注册常量契约段进 system prompt，声明记忆的格式与纪律（文本不含路径，位置恒定，KV 缓存安全）
2. 首条真实用户消息前，读 `<root>/MEMORY.md`，剥元数据、过截断保护，注入为一条独立的 plugin snapshot 消息——**恒注入**：有索引带索引，没有则说明索引尚不存在并同样给出根路径（subagent 会话跳过）
3. 会话中，模型看着索引挑相关条目，用原生 Read 打开对应文件；要记的东西按纪律用原生 Write/Edit 建档改档并同步索引行——插件对读写全程不感知，也没有任何专用工具
4. 会话被压缩（compaction）后，下一轮自动重注入最新索引，长会话不因此失忆

跨 harness 的效果由此产生：ZCode 侧照常读写同一个目录，dsh 写下的文件 ZCode 下个会话从索引里直接看见，反向同理，中间不存在「同步」这个动作。

已知边界：并发写按单人错峰假设处理，不加锁；v1 没有后台自动沉淀（v2 预留文件模式的 dream、doctor/lint 和基准测试）；索引超限走截断警告，正确的应对是整理记忆而不是上检索引擎。

## 使用时发现的问题与修复

### 0.1.2 -> 0.1.3

空工作区模型「失明」：快照只在 `MEMORY.md` 存在时注入，而格式契约段为了 KV 缓存刻意不含根路径——于是新建工作区里模型既读不到旧记忆（分桶约定，正常），也不知道根路径、无法开始写（偏离 ZCode 契约，bug）。对照：ZCode 的契约段自带 "persistent file-based memory at `<root>/`"，空桶从第一轮就能写。

> 修复：快照恒注入——有索引带索引，无索引带根路径加「索引尚不存在」说明；契约段保持无路径不变。同版配套：dsh 侧 AGENTS.md 移植 ZCode 的记忆纪律段（含指向 default 桶的读取指针），补齐跨工作区可达性与「何时写记忆」的行为纪律——这两层分别对应 ZCode 生态的机制与约定，缺一不可。

