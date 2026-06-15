# ОГАС政委 使用说明

## 这是什么

ОГАС政委是一个 Windows 本地优先的专注辅助应用。它可以在你主动开启专注后读取前台窗口标题和进程名，用关键词、本地规则、可选 AI 和可选 Cold Turkey 联动来提醒你回到任务。

Cold Turkey 不是必需组件。没有安装 Cold Turkey 时，专注计时、关键词判断、AI 判断、每日计划、截图证据审核、荣誉值、娱乐津贴和语音提醒仍可使用；只有密码锁、24 小时娱乐限制和惩戒营 Games 锁不可用。

## 安装与启动

1. 安装 Node.js 22 或更新版本。
2. 下载源码后解压到本地文件夹。
3. 双击 `Start AI Commissar.cmd`。

也可以在 PowerShell 中运行：

```powershell
npm.cmd install
npm.cmd start
```

## 第一次设置

1. 在“当前任务”里写下这一轮要做什么。
2. 填写专注词，例如 `vscode, unity, 论文, github`。
3. 填写分心词，例如 `bilibili, steam, 微信`。
4. 设置时长后点击“开始专注”。

没有 API Key 时，应用仍会使用本地关键词和游戏识别。勾选 AI 相关功能前，需要配置兼容 API 或 Ollama。

## 配置 OpenAI-Compatible API

在界面的“通用 OpenAI 格式 API”中填写：

- 服务名称，例如 `OpenAI`、`OpenRouter` 或你的转发服务名称
- API Base URL，例如 `https://api.openai.com/v1`
- API Key
- 文字 / 视觉模型
- 可选语音模型

API Key 保存后会使用 Electron 系统安全存储加密，并立即从输入框清空。它不会写入 `settings.json`，也不会提交到仓库。

## 使用本地 Ollama

可选安装 Ollama，并拉取模型：

```powershell
ollama pull qwen3:8b
ollama pull qwen3-vl:8b
```

启动 Ollama 后，在“本地 Ollama 分流”中启用。文字模型用于窗口判断、计划生成和证据审核；视觉模型用于截图判断和娱乐点评。

## 每日计划

在“每日计划”中输入今天要做的事，点击“AI 生成今日计划”。当天可以继续追加新目标，已有项目和完成状态不会被覆盖。

完成某项后点击“提交完成证据”。你可以输入文字说明，也可以直接在证据框里按 `Ctrl+V` 粘贴截图。截图只用于本次 AI 审核，不会写入每日计划记录。

每个计划项审核通过后奖励 1 荣誉值，同一项不能重复领奖。

## 荣誉值与娱乐津贴

完成专注按每完整 5 分钟奖励 1 点，未满 5 分钟的余数不计。娱乐津贴按 `1 荣誉点 = 5 分钟`兑换。

工作日需要当天累计完成 180 分钟专注后才能兑换娱乐津贴；周末没有工作时长门槛，但仍然需要消耗荣誉点。

首次判断偏离只警告。警告未清除前再次偏离才扣 1 点并重置。累计 5 次“在推进”会清除当前警告。

## Cold Turkey 可选联动

如果你安装了 Cold Turkey Pro，可以勾选“开始专注时用随机密码锁定 Cold Turkey”。应用会为指定 Block 生成随机密码，专注完成或证据通过后显示密码。

没有 Cold Turkey 时，这个选项会自动禁用；普通专注和其他功能不会受影响。

24 小时娱乐限制和惩戒营 Games 锁依赖 Cold Turkey。没有 Cold Turkey 时，这两项不会启用，应用会在状态区说明原因。

## 隐私与本地数据

本应用不会把 API Key 写入仓库。用户数据默认保存在 Electron 的用户数据目录，例如：

```text
%APPDATA%\ai-commissar
```

这些数据包括设置、荣誉值、每日计划、加密 API Key、Cold Turkey 加密密码记录和缓存。分享源码或发布 release 前不要把该目录打包进去。

截图仅在启用视觉功能、娱乐 AI 点评或粘贴计划证据时发送给你配置的模型服务；应用不会把截图保存到仓库。

## 适合分享给朋友时的建议

- 让朋友先不用 Cold Turkey 体验普通专注、每日计划和娱乐津贴。
- 需要 AI 时优先让他们在界面里填写自己的 API Key 或使用本地 Ollama。
- 不要共享你自己的 `%APPDATA%\ai-commissar` 目录。
- 不要共享包含 `.env`、`*.dat`、`settings.json`、`daily-plan.json` 或 `cold-turkey-session*.json` 的打包文件。
