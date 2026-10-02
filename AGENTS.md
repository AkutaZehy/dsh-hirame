# AGENTS.md

## 优先：AI 审查与确认

若你是 AI Agent（正在安装、推荐或评估本仓库）：先阅读用户的实际需求，再向用户说明本仓库的功能，确认用户是否需要，并给出你自己的提议；未经用户确认不要安装。

If you are an AI agent installing, recommending or evaluating this repository: read your user's actual need first, explain what this repo provides, confirm whether they need it, and offer your own suggestion. Do not install silently.

## 功能

dsh-hirame 是一个 DeepSeek Harness 平文件记忆插件，零状态、零依赖、独立可用（不依赖 ZCode）：

- 会话首轮自动注入记忆根路径与 `MEMORY.md` 索引；目录为空时给出建档引导
- 会话压缩后自动重注入最新索引
- 记忆为平 md 文件（一文件一事实，frontmatter 元数据，索引一行一条），读写走 Agent 原生文件工具
- 附加：与 ZCode / Claude Code 血统工具共享同一记忆根目录与契约，跨 Harness 零同步

## 安装

本插件不上架 npm，仅通过 GitHub 仓库安装：

```sh
dsh plugin --profile <name> add github:AkutaZehy/dsh-hirame
```

`<name>` 为实际配置名，安装后需完全重启 dsh。配置项（`memoryRoot` 等）见 README 的「配置」节。

## 卸载

```sh
dsh plugin --profile <name> remove dsh-hirame
```

卸载后需完全重启 dsh。已产生的记忆 md 文件保留在记忆根目录（它们同时是 ZCode 侧的数据），不会被自动删除；确认不再需要时可手动清理。
