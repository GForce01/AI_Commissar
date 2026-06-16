# ОГАС政委 使用说明

## 这是什么

ОГАС政委是一个 Windows 本地优先的专注辅助应用。它可以在你主动开启专注后读取前台窗口标题和进程名，用关键词、本地规则、可选 AI 和可选 Cold Turkey 联动来提醒你回到任务。

Cold Turkey 不是必需组件。没有安装 Cold Turkey 时，专注计时、关键词判断、AI 判断、每日计划、截图证据审核、荣誉值、娱乐津贴和语音提醒仍可使用；只有密码锁、24 小时娱乐限制和惩戒营 Block 锁不可用。

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

- 服务显示名称，例如 `OpenAI`、`OpenRouter` 或你的转发服务名称；它只用于界面和错误提示
- 文字 API Base URL，例如 `https://api.openai.com/v1`
- 视觉 API Base URL，可以和文字相同，也可以填另一个 OpenAI-compatible 服务
- 语音 API Base URL，可以和文字相同；如果语音模型留空则不会使用
- 语音服务：OpenAI-compatible 或 Qwen-TTS（阿里云百炼）
- 文字 API Key
- 视觉 API Key
- 语音 API Key
- 文字模型
- 视觉模型
- 可选语音模型；留空会停用 AI 语音

视觉模型旁边的“同文字模型”按钮可以一键复制文字模型名称和文字 API Base URL。视觉/语音 Key 旁边的“同文字 Key”按钮可以复制当前输入的文字 Key；如果文字 Key 已保存但不显示，也可以在后台同步已保存的文字 Key。API Key 保存后会使用 Electron 系统安全存储加密，并立即从输入框清空。它不会写入 `settings.json`，也不会提交到仓库。旧版单一 API Key 会作为升级后的默认后备，直到你分别保存新的 Key。

文字、视觉和语音测试按钮会使用当前保存的 Key、Base URL 和模型配置发起真实请求。测试语音模型时会播放一句试听短句；如果语音模型留空，语音相关功能会暂时停用。

如果选择 Qwen-TTS，应用会使用阿里云百炼非实时语音合成接口，默认 Base URL 为 `https://dashscope.aliyuncs.com/api/v1`，默认模型为 `qwen3-tts-vd-2026-01-26`。界面内置青年政委、中年政委和老政委等预设音色，也可以手动输入自定义 voiceID。实时语音合成属于 WebSocket 流式接口，暂不适合当前的短句缓存播放流程。

使用 Qwen / DashScope 文字或视觉模型时，应用默认在 chat 请求中加入 `extra_body.enable_thinking = false`，更适合分类、证据审核和短点评这类需要直接输出的任务。

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

Cold Turkey 联动里有两个 Block 名称：常规 / 娱乐限制 Block 用于普通专注和 24 小时娱乐限制；惩戒营 Block 用于惩戒营强制锁，默认是 `Games`。建议两者不要使用同一个 Cold Turkey Block。

24 小时娱乐限制和惩戒营 Block 锁依赖 Cold Turkey。没有 Cold Turkey 时，这两项不会启用，应用会在状态区说明原因。

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
