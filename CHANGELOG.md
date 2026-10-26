# Changelog

本文件记录 dsh-hirame 的行为变更。设计终态见 [docs/DESIGN.md](docs/DESIGN.md)，使用说明见 [README.md](README.md)。0.1.2 及更早版本的提交记录见 git 历史。

## 0.1.6 (2026-10-15)

### Changed

- 文档改写为面向人的表述（README、AGENTS.md、DESIGN.md 同步）。

## 0.1.5 (2026-10-02)

### Added

- 首个可从 GitHub 直接安装的版本（`dsh plugin --profile <name> add github:AkutaZehy/dsh-hirame`），纯文件记忆插件，git-only 安装。

## 0.1.4 (2026-10-02)

### Changed

- 文档：双定位（独立可用优先，跨 Harness 为附加项）；AGENTS.md 重构为面向使用者的分节；测试向量改为合成数据并清除本机路径。

## 0.1.3 (2026-10-02)

### Fixed

- **空工作区模型「失明」**：快照只在 `MEMORY.md` 存在时注入，而格式契约段为了 KV 缓存刻意不含根路径——于是新建工作区里模型既读不到旧记忆（分桶约定，正常），也不知道根路径、无法开始写（偏离 ZCode 契约，bug）。对照：ZCode 的契约段自带 "persistent file-based memory at `<root>/`"，空桶从第一轮就能写。
- 快照恒注入：有索引带索引，无索引带根路径加「索引尚不存在」说明；契约段保持无路径不变。同版配套：dsh 侧 AGENTS.md 移植 ZCode 的记忆纪律段（含指向 default 桶的读取指针），补齐跨工作区可达性与「何时写记忆」的行为纪律——这两层分别对应 ZCode 生态的机制与约定，缺一不可。
