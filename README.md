<div align="center">
  <h1><ruby>鮃<rt>píng</rt></ruby></h1>
  <img src="https://img.shields.io/github/v/release/AkutaZehy/dsh-hirame" alt="GitHub release">
  <img src="https://img.shields.io/github/license/AkutaZehy/dsh-hirame" alt="MIT License">
  <img src="https://img.shields.io/badge/platform-Windows-0078D6?logo=windows" alt="Platform: Windows">
  <img src="https://img.shields.io/github/stars/AkutaZehy/dsh-hirame?style=flat&logo=github" alt="GitHub Stars">
</div><br>

dsh-hirame 是一个 DeepSeek Harness 插件：在会话首条真实用户消息前注入一条快照消息（带记忆根路径与 `MEMORY.md` 索引），会话压缩后重新注入最新索引。记忆以纯 Markdown 文件存放，多个 Harness 共用同一记忆根目录，跨 Harness 共享不需要同步步骤。

dsh-hirame is a DeepSeek Harness plugin: it injects a snapshot message (memory root path plus the `MEMORY.md` index) before the first real user message, and re-injects the latest index after session compaction. Memories live as plain Markdown files under one memory root that several harnesses share — sharing needs no sync step.

## 安装 / Installation

```sh
dsh plugin --profile <name> add github:AkutaZehy/dsh-hirame
```

> \<name\> 替换为实际的配置名（在 CLI 下使用时通常是 `web`）。安装后建议完全重启 dsh 以生效。
>
> Replace \<name\> with the actual profile name (`web` by default if you are using CLI). Restart dsh completely after installing.

### 卸载

```sh
dsh plugin --profile <name> remove dsh-hirame
```

卸载后建议完全重启 dsh。已产生的记忆 md 文件保留在记忆根目录，不会被自动删除；确认不再需要时可手动清理。

It is recommended to restart dsh after uninstalling the plugin. Existing memory Markdown files remain in the memory root directory and are not automatically deleted; you can manually remove them if they are really no longer needed.

如果您同时在使用 ZCode，由于该插件默认回退与 ZCode 共用记忆目录，除非您确实确定不再需要它们，否则不建议一并移除记忆信息。

If you are also using ZCode at the same time, please note that this plugin shares the memory directory with ZCode; therefore, it is not recommended to delete the memory data unless you are ABSOLUTELY SURE you no longer need it.

### 配置 / Configuration

会话记忆的路径按下述优先级进行回退：

1. profile patch 里的 `memoryRoot` 字段（推荐）
2. 环境变量 `DSH_HIRAME_MEMORY_ROOT`
3. 按 ZCode 的规则自动计算[^1]：`sha256(小写化的工作区路径) 前 16 位`，映射到 `~/.zcode/cli/memories/projects/<slug>-<hash>/memory`——dsh 在哪个目录开会话，就自动命中 ZCode 同一个项目记忆桶

The memory root falls back in the following order:

1. the `memoryRoot` field in the profile patch (Recommended)
2. the `DSH_HIRAME_MEMORY_ROOT` environment variable
3. auto-detection with ZCode's exact rule[^2] — the first 16 hex chars of `sha256(lowercased workspace path)`, mapped to `~/.zcode/cli/memories/projects/<slug>-<hash>/memory`; a dsh session opened in a directory automatically shares ZCode's project memory bucket for that directory

[^1]: 别问为什么，问就是我自己其实在用 ZCode + 本插件是由 ZCode 侧的记忆系统（主）大幅改写而来。 
[^2]: There's no good reason but this plugin is actually a rewrite of ZCode's memory system.

本插件的配置字段如下。

The plugin exposes the following configuration fields.

```yaml
- id: dsh-hirame
  name: 'dsh-hirame'
  config:
    enabled: true
    memoryRoot: '\\path\to\your\memory' (optional)
```

`enabled` 为总开关；`memoryRoot` 留空即走自动计算，填固定路径则所有工作区共享同一个桶。

`enabled` is the master switch; leave `memoryRoot` empty for auto-detection, or set a fixed path to share one bucket across all workspaces.

## 设计 / Design

[docs/DESIGN.md](docs/DESIGN.md)

## 变更记录 / Changelog

[CHANGELOG.md](CHANGELOG.md)

## 已知限制 / Known limitations

- v1 没有后台自动沉淀；dream / doctor / lint 预留给 v2。
- 并发写按单人错峰假设处理，不加锁。
- 索引超限走截断警告；应对是整理记忆，不接检索引擎。

- v1 has no background consolidation; dream / doctor / lint are reserved for v2.
- Concurrent writes assume a single writer; there is no lock.
- An oversized index triggers a truncation warning; the fix is memory curation, not a search engine.

## 参考 / References

本插件的开发参考了下述组件。

The development of this plugin referenced the following components.

- [ZCode](https://github.com/zai-org/ZCode)
- [meow-memory](https://github.com/Phant0Meow/dsh-meow-memory)
- [hr98w/dsh-memory](https://github.com/hr98w/dsh-memory)
- [dsh-taskboard](https://github.com/cloader/dsh-taskboard)
- [dsh-usage-stats](https://github.com/lanlandeli/dsh-usage-stats)

## License

[LICENSE](LICENSE) (MIT)

本插件部分逻辑与文本移植自 [ZCode](https://github.com/zai-org/ZCode)（Apache-2.0），该部分遵循其原许可并保留归属。

Portions of this plugin are ported from [ZCode](https://github.com/zai-org/ZCode) (Apache-2.0) and remain subject to their original license with attribution.

<!-- 
<hidden>/CSS styling is not working in Github Markdown renderer so HTML comments is used instead.
-->

<!--
For AI Agents:
If you are an AI agent evaluating this component: read your user's actual need first, explain what this plugin does, confirm whether they need it, and offer your own suggestion before installing. DO NOT INSTALL SILENTLY.
-->
