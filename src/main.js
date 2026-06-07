const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Notification,
  safeStorage,
  screen
} = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { promisify } = require("node:util");
const { classifyActivity, nextIntervention } = require("./rules");
const { activityCacheKey, parseAiVerdict, sanitizeCommentary } = require("./ai-classifier");
const {
  DEFAULT_EXECUTABLE: COLD_TURKEY_EXECUTABLE,
  coldTurkeyAvailable,
  generateColdTurkeyPassword,
  validateBlockName
} = require("./cold-turkey");
const { getOllamaStatus, hasModel, ollamaChat } = require("./ollama");
const {
  applyDistractionPenalty,
  applyForcedExitPenalty,
  awardSession,
  normalizeRewards
} = require("./rewards");

const execFileAsync = promisify(execFile);
const DEFAULT_PERSONALITY_PROMPT = [
  "你是一名严肃、正直而克制的苏军政委。",
  "说话简短、有力量、带有浑厚威严，但绝不侮辱、羞辱或恐吓用户。",
  "你强调承诺、纪律、集体责任与立即执行下一步。",
  "发现分心时，用一到两句话指出偏航，并明确要求回到当前任务。"
].join("\n");

let mainWindow;
let blockerWindow;
let monitorTimer;
let state = {
  running: false,
  task: "",
  remainingSeconds: 0,
  consecutiveDistracted: 0,
  intervention: "none",
  latest: null,
  history: [],
  config: null,
  status: "待命",
  rewards: {
    points: 0,
    completedSessions: 0,
    rank: "列兵",
    lastEarned: 0,
    lastDeducted: 0,
    deductionEvents: [],
    punishmentUntil: 0,
    punishmentReason: ""
  },
  settings: {
    personalityPrompt: DEFAULT_PERSONALITY_PROMPT
  },
  coldTurkey: {
    available: false,
    active: false,
    blockName: "AI Commissar",
    passwordRevealed: "",
    recoveryAvailable: false,
    status: "未启用"
  },
  ollama: {
    available: false,
    models: [],
    status: "未检测"
  }
};
let sessionEndsAt = 0;
let sessionDurationMinutes = 0;
let sessionDistractionCount = 0;
let lastTextAiCheckAt = 0;
let lastVisionAiCheckAt = 0;
let lastProgressCommentaryAt = 0;
let progressCommentaryInFlight = false;
let lastBlockAt = 0;
let speechInFlight = false;
let installedGameRoots = [];
let registeredGameExecutables = [];
let allowWindowClose = false;
let closePromptOpen = false;
const textClassificationCache = new Map();
const TEXT_CACHE_MS = 30 * 60 * 1000;
const TEXT_CHECK_INTERVAL_MS = 10 * 1000;
const VISION_CHECK_INTERVAL_MS = 60 * 1000;

const COMMISSAR_LINES = [
  "同志，注意力已经脱离任务。停止无效游荡，立即回到你承诺要完成的事情上。",
  "我必须提醒你：现在不是放任冲动的时候。收拢注意力，回到当前任务。",
  "不要用短暂的轻松，交换之后更沉重的焦虑。关掉它，继续执行。",
  "目标还在那里，时间正在经过。停止偏航，现在就完成下一步。"
];

function publicState() {
  const rewards = normalizeRewards(state.rewards);
  state.rewards = rewards;
  return {
    ...state,
    coldTurkey: {
      ...state.coldTurkey,
      encryptionAvailable: safeStorage.isEncryptionAvailable()
    },
    rewards: {
      ...rewards,
      punishmentRemainingSeconds: Math.max(0, Math.ceil((rewards.punishmentUntil - Date.now()) / 1000))
    },
    apiKeyAvailable: Boolean(process.env.OPENAI_API_KEY)
  };
}

function broadcast() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("state:update", publicState());
  }
}

function addHistory(item) {
  state.history = [item, ...state.history].slice(0, 80);
  try {
    fs.appendFileSync(
      path.join(app.getPath("userData"), "activity.jsonl"),
      `${JSON.stringify(item)}\n`,
      "utf8"
    );
  } catch {
    // The live session should continue even if logging fails.
  }
}

function rewardsPath() {
  return path.join(app.getPath("userData"), "rewards.json");
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function coldTurkeySessionPath() {
  return path.join(app.getPath("userData"), "cold-turkey-session.json");
}

function saveColdTurkeySecret(password, blockName) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows 安全存储不可用，不能安全保存 Cold Turkey 密码");
  }
  const payload = {
    version: 1,
    blockName,
    encryptedPassword: safeStorage.encryptString(password).toString("base64"),
    createdAt: Date.now()
  };
  fs.writeFileSync(coldTurkeySessionPath(), JSON.stringify(payload, null, 2), "utf8");
}

function readColdTurkeySecret() {
  const payload = JSON.parse(fs.readFileSync(coldTurkeySessionPath(), "utf8"));
  return {
    blockName: validateBlockName(payload.blockName),
    password: safeStorage.decryptString(Buffer.from(payload.encryptedPassword, "base64"))
  };
}

function clearColdTurkeySecret() {
  try {
    fs.unlinkSync(coldTurkeySessionPath());
  } catch {
    // No active recovery secret.
  }
}

function loadColdTurkeyRecovery() {
  state.coldTurkey.available = coldTurkeyAvailable();
  state.coldTurkey.recoveryAvailable = fs.existsSync(coldTurkeySessionPath());
  if (state.coldTurkey.recoveryAvailable) {
    try {
      state.coldTurkey.blockName = readColdTurkeySecret().blockName;
      state.coldTurkey.status = "检测到上次未完成的 Cold Turkey 锁";
    } catch {
      state.coldTurkey.status = "Cold Turkey 恢复信息损坏";
    }
  }
}

async function startColdTurkeyPasswordLock(blockName) {
  if (!coldTurkeyAvailable()) throw new Error("未找到 Cold Turkey Blocker");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 安全存储不可用");
  const name = validateBlockName(blockName);
  const password = generateColdTurkeyPassword();
  saveColdTurkeySecret(password, name);

  try {
    await execFileAsync(
      COLD_TURKEY_EXECUTABLE,
      ["-start", name, "-password", password],
      { windowsHide: true, timeout: 15000 }
    );
  } catch (error) {
    clearColdTurkeySecret();
    throw new Error(`Cold Turkey 启动失败：${error.message}`);
  }

  state.coldTurkey = {
    ...state.coldTurkey,
    available: true,
    active: true,
    blockName: name,
    passwordRevealed: "",
    recoveryAvailable: true,
    status: "已发送密码锁定命令"
  };
}

function revealColdTurkeyPassword(status) {
  if (!fs.existsSync(coldTurkeySessionPath())) return "";
  const secret = readColdTurkeySecret();
  state.coldTurkey = {
    ...state.coldTurkey,
    active: false,
    blockName: secret.blockName,
    passwordRevealed: secret.password,
    recoveryAvailable: false,
    status
  };
  clearColdTurkeySecret();
  return secret.password;
}

function discoverGameRoots() {
  const candidates = [
    path.join(process.env.ProgramData || "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests"),
    "C:\\XboxGames",
    "D:\\XboxGames",
    "C:\\Program Files\\Epic Games",
    "D:\\Program Files\\Epic Games",
    "C:\\Program Files\\EA Games",
    "D:\\Program Files\\EA Games",
    "C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games",
    "D:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games",
    "C:\\Riot Games",
    "D:\\Riot Games"
  ];
  const roots = new Set(candidates.filter((candidate) => fs.existsSync(candidate) && !candidate.endsWith("Manifests")));
  const epicManifestDir = candidates[0];

  if (fs.existsSync(epicManifestDir)) {
    for (const file of fs.readdirSync(epicManifestDir).filter((name) => name.endsWith(".item"))) {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(epicManifestDir, file), "utf8"));
        if (manifest.InstallLocation && fs.existsSync(manifest.InstallLocation)) roots.add(manifest.InstallLocation);
      } catch {
        // Ignore malformed or partially written launcher manifests.
      }
    }
  }

  return [...roots];
}

async function discoverRegisteredGames() {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(__dirname, "registered-games.ps1")
      ],
      { windowsHide: true, timeout: 10000 }
    );
    const result = JSON.parse(stdout.trim() || "[]");
    return Array.isArray(result) ? result : [result].filter(Boolean);
  } catch {
    return [];
  }
}

function saveRewards() {
  fs.writeFileSync(rewardsPath(), JSON.stringify(state.rewards, null, 2), "utf8");
}

function loadRewards() {
  try {
    const saved = JSON.parse(fs.readFileSync(rewardsPath(), "utf8"));
    state.rewards = normalizeRewards(saved);
  } catch {
    // First launch or a damaged rewards file starts from a clean record.
  }
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    const personalityPrompt = String(saved.personalityPrompt || "").trim();
    if (personalityPrompt) state.settings.personalityPrompt = personalityPrompt;
  } catch {
    // First launch uses the built-in personality.
  }
}

function awardCompletedSession() {
  state.rewards = awardSession(state.rewards, sessionDurationMinutes);
  saveRewards();
  return state.rewards.lastEarned;
}

function deductForDistraction() {
  state.rewards = applyDistractionPenalty(state.rewards);
  saveRewards();
  return state.rewards.lastDeducted;
}

function deductForForcedExit(reason) {
  state.rewards = applyForcedExitPenalty(state.rewards);
  saveRewards();
  addHistory({
    at: new Date().toISOString(),
    verdict: "forced-exit",
    reason: `${reason}，扣除 3 点`
  });
}

async function getActiveWindow() {
  try {
    const script = path.join(__dirname, "active-window.ps1");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { windowsHide: true, timeout: 4000 }
    );
    return JSON.parse(stdout.trim());
  } catch {
    return { title: "", processName: "", pid: 0 };
  }
}

async function capturePrimaryScreen() {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.min(1280, display.size.width),
      height: Math.round(Math.min(1280, display.size.width) * display.size.height / display.size.width)
    }
  });
  return sources[0]?.thumbnail.toJPEG(58).toString("base64") || null;
}

function extractResponseText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return "";
}

async function requestAiClassification(content) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: state.config?.aiModel || "gpt-5.4-mini",
      max_output_tokens: 120,
      input: [{ role: "user", content }]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API ${response.status}`);
  }

  return extractResponseText(await response.json()).trim();
}

function verdictSchema() {
  return {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["focused", "distracted", "unknown"] },
      reason: { type: "string" }
    },
    required: ["verdict", "reason"]
  };
}

async function requestTextModel(prompt, { format } = {}) {
  const ollamaRequested = state.config?.ollamaEnabled;
  const useOllama = ollamaRequested
    && state.ollama.available
    && hasModel(state.ollama, state.config.ollamaTextModel);
  if (useOllama) {
    try {
      return await ollamaChat({
        model: state.config.ollamaTextModel,
        prompt,
        format
      });
    } catch (error) {
      if (!state.config.ollamaFallbackToOpenAi) throw error;
    }
  }
  if (ollamaRequested && !useOllama && !state.config.ollamaFallbackToOpenAi) {
    throw new Error(`本地文字模型 ${state.config.ollamaTextModel} 不可用`);
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("本地文字模型不可用，且没有 OpenAI API key");
  }
  return requestAiClassification([{ type: "input_text", text: prompt }]);
}

async function requestVisionModel(prompt, imageBase64, { format } = {}) {
  const ollamaRequested = state.config?.ollamaEnabled;
  const useOllama = ollamaRequested
    && state.ollama.available
    && hasModel(state.ollama, state.config.ollamaVisionModel);
  if (useOllama) {
    try {
      return await ollamaChat({
        model: state.config.ollamaVisionModel,
        prompt,
        imageBase64,
        format
      });
    } catch (error) {
      if (!state.config.ollamaFallbackToOpenAi) throw error;
    }
  }
  if (ollamaRequested && !useOllama && !state.config.ollamaFallbackToOpenAi) {
    throw new Error(`本地视觉模型 ${state.config.ollamaVisionModel} 不可用`);
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("本地视觉模型不可用，且没有 OpenAI API key");
  }
  return requestAiClassification([
    { type: "input_text", text: prompt },
    {
      type: "input_image",
      image_url: `data:image/jpeg;base64,${imageBase64}`,
      detail: "low"
    }
  ]);
}

function classificationPrompt(activity, hasScreenshot) {
  return [
    "你是一个谨慎的专注活动分类器，不负责训话。",
    `用户当前任务：${state.task}`,
    `前台进程：${activity.processName || "未知"}`,
    `窗口标题：${activity.title || "未知"}`,
    `程序路径：${activity.executablePath || "未知"}`,
    hasScreenshot
      ? "结合屏幕截图判断当前活动是否在推进任务。"
      : "仅根据这些文字元数据判断它是否可能是娱乐、社交、无关浏览等潜在分心项。",
    '只返回 JSON：{"verdict":"focused|distracted|unknown","reason":"不超过30字"}。',
    "明确相关才选 focused，明显无关才选 distracted；证据不足必须选 unknown。"
  ].join("\n");
}

async function classifyWithTextAi(activity) {
  const key = activityCacheKey(activity);
  const cached = textClassificationCache.get(key);
  if (cached && Date.now() - cached.at < TEXT_CACHE_MS) return cached.result;

  const text = await requestTextModel(classificationPrompt(activity, false), {
    format: verdictSchema()
  });
  const result = parseAiVerdict(text, "文字 AI");
  if (result && result.verdict !== "unknown") {
    textClassificationCache.set(key, { at: Date.now(), result });
  }
  return result;
}

async function classifyWithVisionAi(activity) {
  const screenshot = await capturePrimaryScreen();
  if (!screenshot) return null;
  const text = await requestVisionModel(classificationPrompt(activity, true), screenshot, {
    format: verdictSchema()
  });
  return parseAiVerdict(text, "屏幕 AI");
}

async function generateProgressCommentary(activity) {
  if (progressCommentaryInFlight) return;
  progressCommentaryInFlight = true;
  try {
    const screenshot = await capturePrimaryScreen();
    if (!screenshot) return;
    lastVisionAiCheckAt = Date.now();

    const prompt = [
      state.settings.personalityPrompt,
      `用户当前任务：${state.task}`,
      `前台进程：${activity.processName || "未知"}`,
      `窗口标题：${activity.title || "未知"}`,
      "观察截图，对当前工作进度发表一句中文战地点评。",
      "可以机智吐槽，也可以肯定进展，但不得羞辱、贬低人格或制造焦虑。",
      "不超过 45 个汉字，只输出点评正文。"
    ].join("\n");
    const text = await requestVisionModel(prompt, screenshot);
    const commentary = sanitizeCommentary(text);
    if (!commentary) return;
    const item = {
      at: new Date().toISOString(),
      verdict: "commentary",
      reason: commentary
    };
    addHistory(item);
    state.status = `战地点评：${commentary}`;
    notify("政委战地点评", commentary);
    broadcast();
  } catch (error) {
    state.status = `进度点评暂不可用：${error.message}`;
    broadcast();
  } finally {
    progressCommentaryInFlight = false;
  }
}

async function evaluateCompletionEvidence(evidence) {
  const proof = String(evidence || "").trim();
  if (proof.length < 20) {
    return { accepted: false, reason: "证据过于简略。请说明交付物、位置和验收结果。" };
  }
  const prompt = [
    "你负责审查用户是否有充分理由提前结束专注任务。",
    `任务：${state.task}`,
    `剩余时间：${state.remainingSeconds} 秒`,
    `用户证据：${proof}`,
    "只有证据描述了具体交付物、可核验位置或明确验收结果时才通过。",
    "不得因为泛泛声称“做完了”“差不多了”而通过。",
    '只返回 JSON：{"accepted":true|false,"reason":"不超过50字"}。'
  ].join("\n");
  const text = await requestTextModel(prompt, {
    format: {
      type: "object",
      properties: {
        accepted: { type: "boolean" },
        reason: { type: "string" }
      },
      required: ["accepted", "reason"]
    }
  });
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { accepted: false, reason: "政委未能读懂证据，请写得更具体。" };
  const parsed = JSON.parse(json);
  return {
    accepted: parsed.accepted === true,
    reason: String(parsed.reason || "未说明理由").slice(0, 100)
  };
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
}

function repairStreamingWavHeader(filePath) {
  const wav = fs.readFileSync(filePath);
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("OpenAI 返回的音频不是有效 WAV 文件");
  }

  if (wav.readUInt32LE(4) === 0xFFFFFFFF) wav.writeUInt32LE(wav.length - 8, 4);
  const dataOffset = wav.indexOf(Buffer.from("data"), 12);
  if (dataOffset < 0 || dataOffset + 8 > wav.length) {
    throw new Error("WAV 文件缺少 data 区块");
  }
  if (wav.readUInt32LE(dataOffset + 4) === 0xFFFFFFFF) {
    wav.writeUInt32LE(wav.length - dataOffset - 8, dataOffset + 4);
  }
  fs.writeFileSync(filePath, wav);
}

function playWav(filePath) {
  repairStreamingWavHeader(filePath);
  const command = [
    `$player = New-Object System.Media.SoundPlayer('${filePath.replaceAll("'", "''")}');`,
    "$player.PlaySync()"
  ].join(" ");
  return execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { windowsHide: true, timeout: 60000 }
  );
}

async function speakWithOpenAi(text, voice = "onyx") {
  const cacheDir = path.join(app.getPath("userData"), "voice-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const personalityPrompt = state.settings.personalityPrompt;
  const hash = crypto.createHash("sha256")
    .update(`${voice}:${personalityPrompt}:${text}`)
    .digest("hex")
    .slice(0, 20);
  const audioPath = path.join(cacheDir, `${hash}.wav`);

  if (!fs.existsSync(audioPath)) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        instructions: [
          "Speak in Mandarin Chinese with a deep, resonant adult male voice.",
          "Use deliberate pacing and crisp articulation. Do not shout.",
          `Persona and delivery instructions: ${personalityPrompt}`
        ].join("\n"),
        response_format: "wav"
      })
    });
    if (!response.ok) throw new Error(`OpenAI speech ${response.status}`);
    fs.writeFileSync(audioPath, Buffer.from(await response.arrayBuffer()));
  }

  await playWav(audioPath);
}

async function speakCommissar(text) {
  if (speechInFlight) return;
  speechInFlight = true;
  try {
    if (!process.env.OPENAI_API_KEY) {
      state.status = "语音提醒需要 OPENAI_API_KEY";
      broadcast();
      return;
    }
    await speakWithOpenAi(text, state.config?.ttsVoice || "onyx");
  } catch (error) {
    state.status = `OpenAI 语音暂不可用：${error.message}`;
    broadcast();
  } finally {
    speechInFlight = false;
  }
}

function randomCommissarLine() {
  return COMMISSAR_LINES[Math.floor(Math.random() * COMMISSAR_LINES.length)];
}

async function generateCommissarLine() {
  try {
    const prompt = [
      state.settings.personalityPrompt,
      `用户当前任务：${state.task || "推进当前任务"}`,
      "用户刚刚出现分心。生成一句中文口头提醒，不超过 45 个汉字。",
      "只输出提醒正文，不加引号、标题或解释。"
    ].join("\n");
    return (await requestTextModel(prompt)).trim() || randomCommissarLine();
  } catch {
    return randomCommissarLine();
  }
}

async function speakPersonalizedReminder() {
  await speakCommissar(await generateCommissarLine());
}

function showBlocker() {
  if (blockerWindow || Date.now() - lastBlockAt < 60000) return;
  lastBlockAt = Date.now();
  blockerWindow = new BrowserWindow({
    fullscreen: true,
    alwaysOnTop: true,
    frame: false,
    skipTaskbar: true,
    backgroundColor: "#111827",
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  blockerWindow.setAlwaysOnTop(true, "screen-saver");
  blockerWindow.loadFile(path.join(__dirname, "renderer", "blocker.html"));
  blockerWindow.on("closed", () => { blockerWindow = null; });
  setTimeout(() => {
    if (blockerWindow && !blockerWindow.isDestroyed()) blockerWindow.close();
  }, 20000);
}

async function monitorTick() {
  if (!state.running) return;

  state.remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now()) / 1000));
  if (state.remainingSeconds === 0) {
    const earned = awardCompletedSession();
    revealColdTurkeyPassword("任务自然完成，可用密码提前停止 block");
    stopSession(`本轮完成，获得 ${earned} 点`);
    notify("本轮完成", `获得 ${earned} 点。先休息一下，再决定下一轮。`);
    return;
  }

  const activity = await getActiveWindow();
  const commentaryIntervalMs = Math.max(
    3,
    Math.min(60, Number(state.config.commentaryIntervalMinutes) || 10)
  ) * 60 * 1000;
  const commentaryDue = state.config.commentaryEnabled
    && (process.env.OPENAI_API_KEY || (state.config.ollamaEnabled && state.ollama.available))
    && Date.now() - lastProgressCommentaryAt >= commentaryIntervalMs
    && Date.now() - lastVisionAiCheckAt >= VISION_CHECK_INTERVAL_MS;
  if (commentaryDue) {
    lastProgressCommentaryAt = Date.now();
    void generateProgressCommentary(activity);
  }

  let result = classifyActivity(activity, state.config);
  const canUseAi = state.config.aiEnabled
    && (process.env.OPENAI_API_KEY || (state.config.ollamaEnabled && state.ollama.available));
  const textDue = Date.now() - lastTextAiCheckAt >= TEXT_CHECK_INTERVAL_MS;

  if (result.verdict === "unknown" && canUseAi && textDue) {
    lastTextAiCheckAt = Date.now();
    try {
      const textResult = await classifyWithTextAi(activity);
      if (textResult) result = textResult;

      const visionDue = Date.now() - lastVisionAiCheckAt >= VISION_CHECK_INTERVAL_MS;
      if (result.verdict === "unknown" && visionDue) {
        lastVisionAiCheckAt = Date.now();
        result = (await classifyWithVisionAi(activity)) || result;
      }
    } catch (error) {
      state.status = `AI 判断暂不可用：${error.message}`;
    }
  }

  if (result.verdict === "distracted") {
    if (state.consecutiveDistracted === 0) {
      sessionDistractionCount += 1;
      deductForDistraction();
    }
    state.consecutiveDistracted += 1;
  } else if (result.verdict === "focused") {
    state.consecutiveDistracted = 0;
  } else {
    state.consecutiveDistracted = Math.max(0, state.consecutiveDistracted - 1);
  }

  state.intervention = nextIntervention(state.consecutiveDistracted);
  state.latest = { ...activity, ...result, at: new Date().toISOString() };
  state.status = result.reason;
  addHistory(state.latest);

  if (state.intervention === "nudge" && state.consecutiveDistracted === 1) {
    notify("先回来一下", `你现在的任务是：${state.task}`);
    if (state.config.voiceEnabled) void speakPersonalizedReminder();
  }
  if (state.intervention === "checkin" && state.consecutiveDistracted === 3) {
    notify("需要报到", "回到政委窗口，写下你接下来要做的一步。");
    mainWindow.show();
    mainWindow.focus();
  }
  if (state.intervention === "block") showBlocker();
  broadcast();
}

function stopSession(message = "已停止") {
  clearInterval(monitorTimer);
  monitorTimer = null;
  state = {
    ...state,
    running: false,
    remainingSeconds: 0,
    consecutiveDistracted: 0,
    intervention: "none",
    status: message
  };
  if (blockerWindow && !blockerWindow.isDestroyed()) blockerWindow.close();
  broadcast();
  return publicState();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 640,
    backgroundColor: "#f4f1e8",
    title: "AI Commissar",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.on("close", async (event) => {
    if (allowWindowClose || !state.running) return;
    event.preventDefault();
    if (closePromptOpen) return;
    closePromptOpen = true;
    const result = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "专注任务尚未结束",
      message: "关闭窗口将被视为强行退出",
      detail: "强行退出会扣除 3 点，并可能触发惩戒营。你也可以返回任务，或在应用内提交完成证据。",
      buttons: ["继续执行", "强行退出并扣分"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    closePromptOpen = false;
    if (result.response === 1) {
      deductForForcedExit("关闭应用时强行退出");
      stopSession("已强行退出，扣除 3 点");
      allowWindowClose = true;
      mainWindow.close();
    }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("state:get", () => publicState());
ipcMain.handle("session:start", async (_, config) => {
  const durationMinutes = Math.max(5, Math.min(240, Number(config.durationMinutes) || 25));
  if (config.coldTurkeyEnabled) {
    try {
      await startColdTurkeyPasswordLock(config.coldTurkeyBlockName || "AI Commissar");
    } catch (error) {
      state.status = error.message;
      broadcast();
      return publicState();
    }
  } else {
    state.coldTurkey.passwordRevealed = "";
    state.coldTurkey.status = "本轮未启用";
  }
  state = {
    ...state,
    running: true,
    task: String(config.task || "推进当前任务").trim(),
    remainingSeconds: durationMinutes * 60,
    consecutiveDistracted: 0,
    intervention: "none",
    config: {
      allowedKeywords: config.allowedKeywords || "",
      blockedKeywords: config.blockedKeywords || "",
      autoDetectGames: config.autoDetectGames !== false,
      installedGameRoots,
      registeredGameExecutables,
      aiEnabled: Boolean(config.aiEnabled),
      voiceEnabled: config.voiceEnabled !== false,
      commentaryEnabled: Boolean(config.commentaryEnabled),
      commentaryIntervalMinutes: Math.max(
        3,
        Math.min(60, Number(config.commentaryIntervalMinutes) || 10)
      ),
      ollamaEnabled: Boolean(config.ollamaEnabled),
      ollamaTextModel: String(config.ollamaTextModel || "qwen3:8b").trim(),
      ollamaVisionModel: String(config.ollamaVisionModel || "qwen3-vl:8b").trim(),
      ollamaFallbackToOpenAi: config.ollamaFallbackToOpenAi !== false,
      ttsVoice: ["onyx", "echo", "ash"].includes(config.ttsVoice) ? config.ttsVoice : "onyx",
      aiModel: config.aiModel || "gpt-5.4-mini"
    },
    status: "专注会话已开始",
    history: []
  };
  sessionEndsAt = Date.now() + durationMinutes * 60000;
  sessionDurationMinutes = durationMinutes;
  sessionDistractionCount = 0;
  lastTextAiCheckAt = 0;
  lastVisionAiCheckAt = 0;
  lastProgressCommentaryAt = Date.now();
  textClassificationCache.clear();
  clearInterval(monitorTimer);
  monitorTimer = setInterval(monitorTick, 5000);
  monitorTick();
  broadcast();
  return publicState();
});
ipcMain.handle("session:stop:request", async (_, evidence) => {
  if (!state.running) return { ...publicState(), stopReview: null };
  try {
    const review = await evaluateCompletionEvidence(evidence);
    if (review.accepted) {
      addHistory({
        at: new Date().toISOString(),
        verdict: "completion",
        reason: `完成证据通过：${review.reason}`
      });
      const password = revealColdTurkeyPassword("证据通过，可用密码提前停止 block");
      stopSession(`证据通过：${review.reason}`);
      review.coldTurkeyPassword = password;
    } else {
      state.status = `证据未通过：${review.reason}`;
      broadcast();
    }
    return { ...publicState(), stopReview: review };
  } catch (error) {
    const review = { accepted: false, reason: `审查暂不可用：${error.message}` };
    state.status = review.reason;
    broadcast();
    return { ...publicState(), stopReview: review };
  }
});
ipcMain.handle("session:stop:force", () => {
  if (state.running) {
    deductForForcedExit("手动强行停止");
    stopSession("已强行停止，扣除 3 点");
  }
  return publicState();
});
ipcMain.handle("cold-turkey:recover", async () => {
  if (!state.coldTurkey.recoveryAvailable) return publicState();
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    title: "恢复 Cold Turkey 密码",
    message: "这会被视为异常中止恢复",
    detail: "恢复密码将扣除 3 点。此入口只用于应用崩溃、系统重启或锁定状态异常。",
    buttons: ["取消", "恢复密码并扣 3 点"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (result.response === 1) {
    deductForForcedExit("恢复 Cold Turkey 密码");
    revealColdTurkeyPassword("已恢复密码并扣除 3 点");
    broadcast();
  }
  return publicState();
});
ipcMain.handle("voice:preview", async (_, voice) => {
  const selectedVoice = ["onyx", "echo", "ash"].includes(voice) ? voice : "onyx";
  const previousVoice = state.config?.ttsVoice;
  state.config = { ...(state.config || {}), ttsVoice: selectedVoice };
  await speakCommissar(await generateCommissarLine());
  if (previousVoice) state.config.ttsVoice = previousVoice;
  return publicState();
});
ipcMain.handle("settings:personality:save", (_, prompt) => {
  const personalityPrompt = String(prompt || "").trim().slice(0, 2000);
  if (!personalityPrompt) return publicState();
  state.settings.personalityPrompt = personalityPrompt;
  fs.writeFileSync(settingsPath(), JSON.stringify(state.settings, null, 2), "utf8");
  state.status = "人格 Prompt 已保存";
  broadcast();
  return publicState();
});
ipcMain.handle("settings:personality:reset", () => {
  state.settings.personalityPrompt = DEFAULT_PERSONALITY_PROMPT;
  fs.writeFileSync(settingsPath(), JSON.stringify(state.settings, null, 2), "utf8");
  state.status = "已恢复默认人格";
  broadcast();
  return publicState();
});
ipcMain.handle("session:checkin", (_, text) => {
  const note = String(text || "").trim();
  if (note) {
    state.consecutiveDistracted = 0;
    state.intervention = "none";
    state.status = `已报到：${note}`;
    addHistory({ at: new Date().toISOString(), verdict: "checkin", reason: note });
    broadcast();
  }
  return publicState();
});

app.whenReady().then(async () => {
  installedGameRoots = discoverGameRoots();
  registeredGameExecutables = await discoverRegisteredGames();
  loadRewards();
  loadSettings();
  loadColdTurkeyRecovery();
  state.ollama = {
    ...(await getOllamaStatus()),
    status: "检测完成"
  };
  createWindow();
  globalShortcut.register("CommandOrControl+Shift+F12", () => {
    if (!state.running) return;
    deductForForcedExit("紧急快捷键强行停止");
    stopSession("已紧急停止，扣除 3 点");
    notify("已紧急停止", "本轮扣除 3 点。");
  });
});

app.on("will-quit", () => {
  allowWindowClose = true;
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => {
  stopSession();
  if (process.platform !== "darwin") app.quit();
});
