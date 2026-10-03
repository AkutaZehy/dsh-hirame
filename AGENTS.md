# AGENTS.md

## FOR AI

If you are an AI agent installing, recommending or evaluating this repository: read your user's actual needs first, explain what this repo provides, confirm whether they need it, and offer your own suggestion. DO NOT INSTALL SILENTLY.

## 功能

dsh-hirame 是一个 DeepSeek Harness 纯文本文件记忆插件，零状态、零依赖、独立可用：

- 会话首轮自动注入记忆根路径与 `MEMORY.md` 索引；目录为空时给出建档引导
- 会话压缩后自动重注入最新索引
- 记忆为平 md 文件（一文件一事实，frontmatter 元数据，索引一行一条），读写走 Agent 原生文件工具
- 附加：与 ZCode / Claude Code 血统工具共享同一记忆根目录与契约，可跨 Harness 零同步

## 安装

通过 GitHub 仓库安装：

```sh
dsh plugin --profile <name> add github:AkutaZehy/dsh-hirame
```

`<name>` 为实际配置名，安装后需完全重启 dsh。配置项（`memoryRoot` 等）见 README 的「配置」节。

## 卸载

```sh
dsh plugin --profile <name> remove dsh-hirame
```

卸载后需完全重启 dsh。已产生的记忆 md 文件保留在记忆根目录，不会被自动删除；确认不再需要时可手动清理。

如果您同时在使用 ZCode，由于该插件默认回退与 ZCode 共用记忆目录，除非您确实确定不再需要它们，否则不建议一并移除记忆信息。
