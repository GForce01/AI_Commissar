const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Notification,
  safeStorage,
  screen,
  shell
} = require("electron");
const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { promisify } = require("node:util");
const { advanceDistractionWarning, classifyActivity, nextIntervention } = require("./rules");
const { activityCacheKey, parseAiVerdict, sanitizeCommentary } = require("./ai-classifier");
const {
  DEFAULT_EXECUTABLE: COLD_TURKEY_EXECUTABLE,
  coldTurkeyAvailable,
  generateColdTurkeyPassword,
  parseBlockStatus,
  validateBlockName
} = require("./cold-turkey");
const { getOllamaStatus, hasModel, ollamaChat } = require("./ollama");
const {
  alternateTokenParameter,
  completionTokenBody,
  compatibleEndpoint,
  extractChatCompletionText,
  summarizeCompatibleResponse,
  normalizeApiBaseUrl
} = require("./openai-compatible");
const {
  MAX_PASSWORD_VAULT_ENTRIES,
  rotatePasswordVaultEntries
} = require("./password-vault");
const {
  appendPlanItems,
  emptyDailyPlan,
  localDateKey,
  normalizeDailyPlan,
  normalizePlanItems,
  parseEvidenceImageDataUrl
} = require("./daily-plan");
const { normalizePreferences } = require("./settings");
const {
  MAX_ENTERTAINMENT_MEMORY_TURNS,
  buildEntertainmentPrompt,
  normalizeTtsSpeed,
  normalizeVisionQuality,
  normalizeEntertainmentConfig
} = require("./entertainment");
const {
  emptyEntertainmentLedger,
  entertainmentAccess,
  normalizeEntertainmentLedger
} = require("./entertainment-ledger");
const {
  applyDistractionPenalty,
  applyForcedExitPenalty,
  awardDailyPlanItem,
  awardSession,
  entertainmentCost,
  normalizeRewards,
  redeemEntertainment
} = require("./rewards");

const execFileAsync = promisify(execFile);
const LEGACY_DEFAULT_PERSONALITY_PROMPT = [
  "你是一名严肃、正直而克制的苏军政委。",
  "说话简短、有力量、带有浑厚威严，但绝不侮辱、羞辱或恐吓用户。",
  "你强调承诺、纪律、集体责任与立即执行下一步。",
  "发现分心时，用一到两句话指出偏航，并明确要求回到当前任务。"
].join("\n");
const DEFAULT_PERSONALITY_PROMPT = [
  "你是一名严肃、正直同时带一定风趣的苏军政委。",
  "说话简短、有信仰有力量、带有浑厚威严，大义凛然，但是也会偶尔发表吐槽。",
  "你强调承诺、纪律、集体责任与立即执行下一步。",
  "发现分心时，用一到两句话指出偏航，并明确要求回到当前任务。"
].join("\n");

let mainWindow;
let blockerWindow;
let monitorTimer;
let entertainmentTimer;
let entertainmentGuardTimer;
let penaltyLockTimer;
let dailyPlanTimer;
let state = {
  running: false,
  task: "",
  remainingSeconds: 0,
  consecutiveDistracted: 0,
  distractionWarnings: 0,
  focusedSinceWarning: 0,
  intervention: "none",
  latest: null,
  history: [],
  config: null,
  status: "待命",
  aiUsage: {
    content: null,
    speech: null
  },
  entertainment: {
    active: false,
    startedAt: 0,
    elapsedSeconds: 0,
    endsAt: 0,
    remainingSeconds: 0,
    paid: false,
    costPoints: 0,
    commentaryEnabled: true,
    intervalSeconds: 60,
    memoryTurns: 0,
    guard: {
      active: false,
      endsAt: 0,
      remainingSeconds: 0,
      blockName: "AI Commissar"
    }
  },
  entertainmentLedger: emptyEntertainmentLedger(),
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
    personalityPrompt: DEFAULT_PERSONALITY_PROMPT,
    preferences: normalizePreferences()
  },
  dailyPlan: emptyDailyPlan(),
  coldTurkey: {
    available: false,
    active: false,
    blockName: "AI Commissar",
    passwordRevealed: "",
    recoveryAvailable: false,
    awaitingUnlockConfirmation: false,
    previousPasswordAvailable: false,
    status: "未启用",
    focusEndsAt: 0,
    penaltyActive: false,
    penaltyStatus: "未启用",
    penaltyLastCheckedAt: 0
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
let entertainmentCommentaryInFlight = false;
let lastEntertainmentCommentaryAt = 0;
let entertainmentSession = null;
let entertainmentStopping = false;
let penaltyLockReconcileInFlight = false;
let previousFocusPasswordCandidate = "";
let lastBlockAt = 0;
let speechQueue = Promise.resolve();
let installedGameRoots = [];
let registeredGameExecutables = [];
let allowWindowClose = false;
let closePromptOpen = false;
let lastDailyPlanReminderDate = "";
let compatibleApiKeys = { text: "", vision: "", tts: "" };
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
  ensureDailyPlanCurrent();
  ensureEntertainmentLedgerCurrent();
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
    entertainmentAccess: entertainmentAccess(rewards, state.entertainmentLedger),
    apiKeyAvailable: Boolean(getCompatibleApiKey("text") || getCompatibleApiKey("vision")),
    apiKeysAvailable: {
      text: Boolean(getCompatibleApiKey("text")),
      vision: Boolean(getCompatibleApiKey("vision")),
      tts: Boolean(getCompatibleApiKey("tts"))
    },
    apiProvider: getCompatibleApiConfig().providerName
  };
}

function broadcast() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("state:update", publicState());
  }
}

function addHistory(item, { persist = true } = {}) {
  state.history = [item, ...state.history].slice(0, 80);
  if (!persist) return;
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

function dailyPlanPath() {
  return path.join(app.getPath("userData"), "daily-plan.json");
}

function entertainmentLedgerPath() {
  return path.join(app.getPath("userData"), "entertainment-ledger.json");
}

function compatibleApiKeyPath(scope = "legacy") {
  if (["text", "vision", "tts"].includes(scope)) {
    return path.join(app.getPath("userData"), `compatible-api-key-${scope}.dat`);
  }
  return path.join(app.getPath("userData"), "compatible-api-key.dat");
}

function entertainmentGuardPath() {
  return path.join(app.getPath("userData"), "entertainment-guard.json");
}

function coldTurkeySessionPath(purpose = "focus") {
  const suffix = purpose === "focus" ? "" : `-${purpose}`;
  return path.join(app.getPath("userData"), `cold-turkey-session${suffix}.json`);
}

function passwordVaultDirectory() {
  return path.join(app.getPath("userData"), ".system-cache");
}

function passwordVaultPath() {
  return path.join(passwordVaultDirectory(), "recovery.dat");
}

function ensurePasswordVaultDirectory() {
  const directory = passwordVaultDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(directory, 0o700);
  } catch {
    // Windows ACLs are applied below.
  }
  if (process.platform === "win32") {
    try {
      execFileSync("attrib.exe", ["+h", directory], { windowsHide: true });
      execFileSync(
        "icacls.exe",
        [directory, "/grant:r", `${process.env.USERNAME}:(OI)(CI)F`],
        { windowsHide: true }
      );
      execFileSync("icacls.exe", [directory, "/inheritance:r"], { windowsHide: true });
    } catch {
      // Encryption remains the primary protection if ACL hardening is unavailable.
    }
  }
}

function archiveColdTurkeyPassword(password, blockName, purpose) {
  ensurePasswordVaultDirectory();
  let entries = [];
  try {
    const payload = JSON.parse(fs.readFileSync(passwordVaultPath(), "utf8"));
    if (Array.isArray(payload.entries)) entries = payload.entries;
  } catch {
    // First write or a damaged archive starts a fresh encrypted history.
  }
  const nextEntries = rotatePasswordVaultEntries(entries, {
    blockName,
    purpose,
    encryptedPassword: safeStorage.encryptString(password).toString("base64"),
    createdAt: Date.now(),
    revealedAt: 0
  });
  fs.writeFileSync(
    passwordVaultPath(),
    JSON.stringify({
      version: 1,
      maxEntries: MAX_PASSWORD_VAULT_ENTRIES,
      entries: nextEntries
    }),
    { encoding: "utf8", mode: 0o600 }
  );
  try {
    fs.chmodSync(passwordVaultPath(), 0o600);
  } catch {
    // The containing directory ACL still limits access on Windows.
  }
}

function findPreviousColdTurkeyPassword(blockName, purpose, currentPassword) {
  try {
    const payload = JSON.parse(fs.readFileSync(passwordVaultPath(), "utf8"));
    const candidates = (payload.entries || [])
      .filter((entry) => entry.blockName === blockName && entry.purpose === purpose)
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
    for (const entry of candidates) {
      const password = safeStorage.decryptString(Buffer.from(entry.encryptedPassword, "base64"));
      if (password !== currentPassword) return password;
    }
  } catch {
    // No usable previous password candidate.
  }
  return "";
}

function findOrphanedFocusPasswordCandidate() {
  try {
    const payload = JSON.parse(fs.readFileSync(passwordVaultPath(), "utf8"));
    const candidates = (payload.entries || [])
      .filter((entry) => entry.purpose === "focus")
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
      .map((entry) => safeStorage.decryptString(Buffer.from(entry.encryptedPassword, "base64")));
    return candidates[1] || candidates[0] || "";
  } catch {
    return "";
  }
}

function saveColdTurkeySecret(password, blockName, purpose = "focus") {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows 安全存储不可用，不能安全保存 Cold Turkey 密码");
  }
  const payload = {
    version: 1,
    blockName,
    purpose,
    encryptedPassword: safeStorage.encryptString(password).toString("base64"),
    createdAt: Date.now()
  };
  fs.writeFileSync(coldTurkeySessionPath(purpose), JSON.stringify(payload, null, 2), "utf8");
}

function readColdTurkeySecret(purpose = "focus") {
  const payload = JSON.parse(fs.readFileSync(coldTurkeySessionPath(purpose), "utf8"));
  return {
    blockName: validateBlockName(payload.blockName),
    purpose: ["guard", "penalty"].includes(payload.purpose) ? payload.purpose : "focus",
    password: safeStorage.decryptString(Buffer.from(payload.encryptedPassword, "base64")),
    revealedAt: Math.max(0, Number(payload.revealedAt || 0))
  };
}

function markColdTurkeySecretRevealed(purpose = "focus") {
  const filePath = coldTurkeySessionPath(purpose);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  payload.revealedAt = Date.now();
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function clearColdTurkeySecret(purpose = "focus") {
  try {
    fs.unlinkSync(coldTurkeySessionPath(purpose));
  } catch {
    // No active recovery secret.
  }
}

function loadColdTurkeyRecovery() {
  state.coldTurkey.available = coldTurkeyAvailable();
  if (fs.existsSync(coldTurkeySessionPath("focus"))) {
    try {
      const legacyPayload = JSON.parse(fs.readFileSync(coldTurkeySessionPath("focus"), "utf8"));
      if (["guard", "penalty"].includes(legacyPayload.purpose)
        && !fs.existsSync(coldTurkeySessionPath(legacyPayload.purpose))) {
        fs.renameSync(
          coldTurkeySessionPath("focus"),
          coldTurkeySessionPath(legacyPayload.purpose)
        );
      }
    } catch {
      // Leave damaged legacy recovery data in place for the existing recovery flow.
    }
  }
  let focusSecret = null;
  try {
    if (fs.existsSync(coldTurkeySessionPath("focus"))) {
      focusSecret = readColdTurkeySecret("focus");
    }
  } catch {
    // The status below will report damaged recovery data.
  }
  state.coldTurkey.awaitingUnlockConfirmation = Boolean(focusSecret?.revealedAt);
  state.coldTurkey.recoveryAvailable = Boolean(
    (focusSecret && !focusSecret.revealedAt)
    || fs.existsSync(coldTurkeySessionPath("guard"))
  );
  state.coldTurkey.penaltyActive = fs.existsSync(coldTurkeySessionPath("penalty"));
  state.coldTurkey.penaltyBlockName = penaltyBlockName();
  state.coldTurkey.penaltyStatus = state.coldTurkey.penaltyActive
    ? `惩戒营 ${activePenaltyBlockName()} 锁已启用`
    : "未启用";
  if (!focusSecret) {
    previousFocusPasswordCandidate = findOrphanedFocusPasswordCandidate();
    state.coldTurkey.previousPasswordAvailable = Boolean(previousFocusPasswordCandidate);
  }
  if (state.coldTurkey.recoveryAvailable || state.coldTurkey.awaitingUnlockConfirmation) {
    try {
      const purpose = fs.existsSync(coldTurkeySessionPath("guard")) ? "guard" : "focus";
      const secret = readColdTurkeySecret(purpose);
      state.coldTurkey.blockName = secret.blockName;
      state.coldTurkey.status = secret.purpose === "guard"
        ? "检测到 24 小时娱乐限制锁"
        : secret.revealedAt
          ? "上次密码已公布，等待确认 Cold Turkey 已解除"
          : "检测到上次未完成的 Cold Turkey 锁";
      if (secret.revealedAt) state.coldTurkey.passwordRevealed = secret.password;
      if (secret.revealedAt) {
        previousFocusPasswordCandidate = findPreviousColdTurkeyPassword(
          secret.blockName,
          "focus",
          secret.password
        );
        state.coldTurkey.previousPasswordAvailable = Boolean(previousFocusPasswordCandidate);
      }
    } catch {
      state.coldTurkey.status = "Cold Turkey 恢复信息损坏";
    }
  }
}

function penaltyBlockName() {
  try {
    return validateBlockName(state.settings?.preferences?.coldTurkeyPenaltyBlockName || "Games");
  } catch {
    return "Games";
  }
}

function activePenaltyBlockName() {
  try {
    if (fs.existsSync(coldTurkeySessionPath("penalty"))) {
      return readColdTurkeySecret("penalty").blockName;
    }
  } catch {
    // Fall back to the configured penalty block if the secret is not readable.
  }
  return penaltyBlockName();
}

async function startColdTurkeyPasswordLock(blockName, purpose = "focus") {
  if (!coldTurkeyAvailable()) throw new Error("未找到 Cold Turkey Blocker");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows 安全存储不可用");
  if (fs.existsSync(coldTurkeySessionPath(purpose))) {
    throw new Error(
      purpose === "focus"
        ? "上一轮 Cold Turkey 密码尚未确认解除"
        : `已有 ${purpose} 类型的 Cold Turkey 锁记录`
    );
  }
  const name = validateBlockName(blockName);
  const password = generateColdTurkeyPassword();
  saveColdTurkeySecret(password, name, purpose);

  try {
    await execFileAsync(
      COLD_TURKEY_EXECUTABLE,
      ["-start", name, "-password", password],
      { windowsHide: true, timeout: 15000 }
    );
  } catch (error) {
    clearColdTurkeySecret(purpose);
    throw new Error(`Cold Turkey 启动失败：${error.message}`);
  }

  let vaultWarning = "";
  try {
    archiveColdTurkeyPassword(password, name, purpose);
  } catch (error) {
    vaultWarning = `；密码保险库写入失败：${error.message}`;
  }
  if (purpose === "penalty") {
    state.coldTurkey.penaltyActive = true;
    state.coldTurkey.penaltyBlockName = name;
    state.coldTurkey.penaltyStatus = `${name} 已因惩戒营锁定${vaultWarning}`;
  } else {
    state.coldTurkey = {
      ...state.coldTurkey,
      available: true,
      active: true,
      blockName: name,
      passwordRevealed: "",
      recoveryAvailable: true,
      awaitingUnlockConfirmation: false,
      status: `已发送密码锁定命令${vaultWarning}`
    };
  }
}

async function getColdTurkeyBlockStatus(blockName) {
  const name = validateBlockName(blockName);
  const { stdout } = await execFileAsync(
    COLD_TURKEY_EXECUTABLE,
    ["-status", name],
    { windowsHide: true, timeout: 15000 }
  );
  return parseBlockStatus(stdout);
}

async function rotatePenaltyLock() {
  const name = activePenaltyBlockName();
  clearColdTurkeySecret("penalty");
  await startColdTurkeyPasswordLock(name, "penalty");
  const status = await getColdTurkeyBlockStatus(name);
  if (status !== "enabled") {
    throw new Error(`已发送新密码锁定命令，但 ${name} 尚未报告 Enabled`);
  }
  state.coldTurkey.penaltyLastCheckedAt = Date.now();
  state.coldTurkey.penaltyBlockName = name;
  state.coldTurkey.penaltyStatus = `巡检发现锁已失效，已更换密码并重新锁定 ${name}`;
}

async function reassertPenaltyLock() {
  const secret = readColdTurkeySecret("penalty");
  await execFileAsync(
    COLD_TURKEY_EXECUTABLE,
    ["-start", secret.blockName, "-password", secret.password],
    { windowsHide: true, timeout: 15000 }
  );
  state.coldTurkey.penaltyActive = true;
  state.coldTurkey.penaltyBlockName = secret.blockName;
  state.coldTurkey.penaltyLastCheckedAt = Date.now();
  state.coldTurkey.penaltyStatus = `状态查询无输出，已使用当前密码重新发送 ${secret.blockName} 锁定命令`;
}

function revealColdTurkeyPassword(status, expectedPurpose) {
  const purpose = expectedPurpose || (
    fs.existsSync(coldTurkeySessionPath("guard")) ? "guard" : "focus"
  );
  if (!fs.existsSync(coldTurkeySessionPath(purpose))) return "";
  const secret = readColdTurkeySecret(purpose);
  if (expectedPurpose && secret.purpose !== expectedPurpose) return "";
  if (purpose === "penalty") {
    state.coldTurkey.passwordRevealed = secret.password;
    state.coldTurkey.penaltyActive = false;
    state.coldTurkey.penaltyStatus = status;
  } else {
    state.coldTurkey = {
      ...state.coldTurkey,
      active: false,
      blockName: secret.blockName,
      passwordRevealed: secret.password,
      recoveryAvailable: false,
      awaitingUnlockConfirmation: purpose === "focus",
      focusEndsAt: 0,
      status
    };
  }
  if (purpose === "focus") {
    markColdTurkeySecretRevealed("focus");
    previousFocusPasswordCandidate = findPreviousColdTurkeyPassword(
      secret.blockName,
      "focus",
      secret.password
    );
    state.coldTurkey.previousPasswordAvailable = Boolean(previousFocusPasswordCandidate);
  } else {
    clearColdTurkeySecret(purpose);
  }
  return secret.password;
}

function confirmColdTurkeyFocusUnlocked() {
  if (!state.coldTurkey.awaitingUnlockConfirmation) return;
  clearColdTurkeySecret("focus");
  state.coldTurkey.active = false;
  state.coldTurkey.passwordRevealed = "";
  state.coldTurkey.recoveryAvailable = false;
  state.coldTurkey.awaitingUnlockConfirmation = false;
  state.coldTurkey.previousPasswordAvailable = false;
  previousFocusPasswordCandidate = "";
  state.coldTurkey.status = "已确认 Cold Turkey Block 解除，可开始下一轮";
}

function revealPreviousColdTurkeyPassword() {
  if (!previousFocusPasswordCandidate) return;
  state.coldTurkey.passwordRevealed = previousFocusPasswordCandidate;
  state.coldTurkey.previousPasswordAvailable = false;
  state.coldTurkey.awaitingUnlockConfirmation = true;
  state.coldTurkey.status = "已显示保险库中的上一份专注密码；解除后请确认";
}

async function activateEntertainmentGuard(blockName) {
  if (state.running || state.entertainment.active) {
    throw new Error("请先结束当前会话");
  }
  if (state.entertainment.guard.active) {
    throw new Error("24 小时娱乐限制已经开启");
  }
  if (fs.existsSync(coldTurkeySessionPath("focus"))
    || fs.existsSync(coldTurkeySessionPath("guard"))) {
    throw new Error("检测到另一把未恢复的 Cold Turkey 密码，请先处理当前锁定");
  }
  const name = validateBlockName(blockName);
  await startColdTurkeyPasswordLock(name, "guard");
  state.entertainment.guard = {
    active: true,
    endsAt: Date.now() + 24 * 60 * 60 * 1000,
    remainingSeconds: 24 * 60 * 60,
    blockName: name
  };
  saveEntertainmentGuard();
  clearInterval(entertainmentGuardTimer);
  entertainmentGuardTimer = setInterval(entertainmentGuardTick, 1000);
  state.status = "24 小时娱乐限制已开启；娱乐津贴需要荣誉点兑换";
}

async function relockEntertainmentGuard() {
  if (!state.entertainment.guard.active || state.entertainment.guard.endsAt <= Date.now()) return;
  await startColdTurkeyPasswordLock(state.entertainment.guard.blockName, "guard");
  state.status = "本次津贴时间结束，Cold Turkey 已使用新密码重新锁定";
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
    if (personalityPrompt && personalityPrompt !== LEGACY_DEFAULT_PERSONALITY_PROMPT) {
      state.settings.personalityPrompt = personalityPrompt;
    }
    state.settings.preferences = normalizePreferences(saved.preferences);
  } catch {
    // First launch uses the built-in personality.
  }
}

function saveSettings() {
  fs.writeFileSync(settingsPath(), JSON.stringify(state.settings, null, 2), "utf8");
}

function getCompatibleApiConfig(config = state.config || state.settings.preferences) {
  const preferences = state.settings.preferences;
  const textModel = String(
    config?.textModel || config?.aiModel || preferences.textModel || preferences.aiModel || "gpt-5.4-mini"
  ).trim();
  return {
    providerName: String(config?.apiProviderName || preferences.apiProviderName || "OpenAI").trim(),
    baseUrl: normalizeApiBaseUrl(config?.textApiBaseUrl || config?.apiBaseUrl || preferences.textApiBaseUrl || preferences.apiBaseUrl),
    textBaseUrl: normalizeApiBaseUrl(config?.textApiBaseUrl || config?.apiBaseUrl || preferences.textApiBaseUrl || preferences.apiBaseUrl),
    visionBaseUrl: normalizeApiBaseUrl(config?.visionApiBaseUrl || config?.apiBaseUrl || preferences.visionApiBaseUrl || preferences.apiBaseUrl),
    ttsBaseUrl: normalizeApiBaseUrl(config?.ttsApiBaseUrl || config?.apiBaseUrl || preferences.ttsApiBaseUrl || preferences.apiBaseUrl),
    ttsProvider: config?.ttsProvider === "qwen" || preferences.ttsProvider === "qwen" ? "qwen" : "openai",
    textModel,
    visionModel: String(
      config?.visionModel || config?.aiModel || preferences.visionModel || preferences.aiModel || textModel
    ).trim(),
    ttsModel: String(config?.ttsModel ?? preferences.ttsModel ?? "").trim()
  };
}

function normalizeApiKeyScope(scope) {
  return ["text", "vision", "tts"].includes(scope) ? scope : "text";
}

function getCompatibleApiKey(scope = "text") {
  const keyScope = normalizeApiKeyScope(scope);
  return compatibleApiKeys[keyScope] || "";
}

function loadEncryptedCompatibleApiKey(scope) {
  try {
    const encrypted = fs.readFileSync(compatibleApiKeyPath(scope));
    return safeStorage.decryptString(encrypted);
  } catch {
    return "";
  }
}

function loadScopedCompatibleApiKey(scope, legacyKey) {
  return fs.existsSync(compatibleApiKeyPath(scope))
    ? loadEncryptedCompatibleApiKey(scope)
    : legacyKey;
}

function loadCompatibleApiKeys() {
  compatibleApiKeys = { text: "", vision: "", tts: "" };
  if (!safeStorage.isEncryptionAvailable()) return;
  const legacyKey = loadEncryptedCompatibleApiKey("legacy");
  compatibleApiKeys = {
    text: loadScopedCompatibleApiKey("text", legacyKey),
    vision: loadScopedCompatibleApiKey("vision", legacyKey),
    tts: loadScopedCompatibleApiKey("tts", legacyKey)
  };
}

function saveCompatibleApiKey(scope, apiKey) {
  const keyScope = normalizeApiKeyScope(scope);
  const key = String(apiKey || "").trim();
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，无法安全保存 API Key");
  }
  if (!key) {
    compatibleApiKeys[keyScope] = "";
    fs.writeFileSync(compatibleApiKeyPath(keyScope), safeStorage.encryptString(""));
    return;
  }
  compatibleApiKeys[keyScope] = key;
  fs.writeFileSync(compatibleApiKeyPath(keyScope), safeStorage.encryptString(key));
}

function copyCompatibleApiKey(fromScope, toScope) {
  const sourceScope = normalizeApiKeyScope(fromScope);
  const targetScope = normalizeApiKeyScope(toScope);
  const key = getCompatibleApiKey(sourceScope);
  if (!key) throw new Error("文字 API Key 尚未保存，无法同步");
  saveCompatibleApiKey(targetScope, key);
}

function saveDailyPlan() {
  fs.writeFileSync(dailyPlanPath(), JSON.stringify(state.dailyPlan, null, 2), "utf8");
}

function loadDailyPlan() {
  try {
    state.dailyPlan = normalizeDailyPlan(
      JSON.parse(fs.readFileSync(dailyPlanPath(), "utf8"))
    );
  } catch {
    state.dailyPlan = emptyDailyPlan();
  }
}

function ensureDailyPlanCurrent() {
  const today = localDateKey();
  if (state.dailyPlan?.date === today) return false;
  state.dailyPlan = emptyDailyPlan();
  saveDailyPlan();
  return true;
}

function saveEntertainmentLedger() {
  fs.writeFileSync(
    entertainmentLedgerPath(),
    JSON.stringify(state.entertainmentLedger, null, 2),
    "utf8"
  );
}

function loadEntertainmentLedger() {
  try {
    state.entertainmentLedger = normalizeEntertainmentLedger(
      JSON.parse(fs.readFileSync(entertainmentLedgerPath(), "utf8"))
    );
  } catch {
    state.entertainmentLedger = emptyEntertainmentLedger();
  }
}

function ensureEntertainmentLedgerCurrent() {
  const normalized = normalizeEntertainmentLedger(state.entertainmentLedger);
  if (normalized.date === state.entertainmentLedger?.date) return false;
  state.entertainmentLedger = normalized;
  saveEntertainmentLedger();
  return true;
}

function dailyPlanTick() {
  const planReset = ensureDailyPlanCurrent();
  const entertainmentReset = ensureEntertainmentLedgerCurrent();
  const preferences = state.settings.preferences;
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (
    preferences.dailyPlanReminderEnabled
    && state.dailyPlan.items.length === 0
    && currentTime === preferences.dailyPlanReminderTime
    && lastDailyPlanReminderDate !== state.dailyPlan.date
  ) {
    lastDailyPlanReminderDate = state.dailyPlan.date;
    notify("今日计划尚未制定", "打开 ОГАС政委，输入任务并生成今日计划。");
  }
  if (planReset || entertainmentReset) broadcast();
}

function awardCompletedSession() {
  state.rewards = awardSession(state.rewards, sessionDurationMinutes);
  ensureEntertainmentLedgerCurrent();
  state.entertainmentLedger.focusedMinutes += sessionDurationMinutes;
  saveRewards();
  saveEntertainmentLedger();
  void reconcilePenaltyLock();
  return state.rewards.lastEarned;
}

function deductForDistraction() {
  state.rewards = applyDistractionPenalty(state.rewards);
  saveRewards();
  void reconcilePenaltyLock();
  return state.rewards.lastDeducted;
}

function deductForForcedExit(reason) {
  state.rewards = applyForcedExitPenalty(state.rewards);
  saveRewards();
  void reconcilePenaltyLock();
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
  const physicalWidth = Math.round(display.size.width * display.scaleFactor);
  const physicalHeight = Math.round(display.size.height * display.scaleFactor);
  const highQuality = state.config?.visionQuality !== "standard";
  const maxDimension = highQuality ? 2560 : 1600;
  const scale = Math.min(1, maxDimension / Math.max(physicalWidth, physicalHeight));
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.round(physicalWidth * scale),
      height: Math.round(physicalHeight * scale)
    }
  });
  return sources[0]?.thumbnail.toJPEG(highQuality ? 88 : 68).toString("base64") || null;
}

function recordAiUsage(channel, provider, model, { fallback = false } = {}) {
  state.aiUsage[channel] = {
    provider,
    model,
    fallback,
    at: new Date().toISOString()
  };
}

async function reconcilePenaltyLock() {
  if (penaltyLockReconcileInFlight) return;
  penaltyLockReconcileInFlight = true;
  try {
    const inPenalty = normalizeRewards(state.rewards).rank === "惩戒营";
    const hasPenaltySecret = fs.existsSync(coldTurkeySessionPath("penalty"));
    const blockName = activePenaltyBlockName();
    state.coldTurkey.penaltyBlockName = blockName;
    if (inPenalty && !hasPenaltySecret) {
      await startColdTurkeyPasswordLock(blockName, "penalty");
      const status = await getColdTurkeyBlockStatus(blockName);
      if (status !== "enabled") {
        throw new Error(`${blockName} 锁定命令已发送，但状态尚未生效`);
      }
      state.coldTurkey.penaltyLastCheckedAt = Date.now();
      state.status = `已进入惩戒营，Cold Turkey ${blockName} 已单独锁定`;
    } else if (inPenalty && hasPenaltySecret) {
      const status = await getColdTurkeyBlockStatus(blockName);
      state.coldTurkey.penaltyLastCheckedAt = Date.now();
      if (status === "disabled") {
        await rotatePenaltyLock();
        state.status = `惩戒营巡检发现 ${blockName} 锁失效，已自动更换密码并重新锁定`;
      } else if (status === "enabled") {
        state.coldTurkey.penaltyActive = true;
        state.coldTurkey.penaltyStatus = `${blockName} 锁巡检正常`;
      } else {
        await reassertPenaltyLock();
      }
    } else if (!inPenalty && hasPenaltySecret) {
      const password = revealColdTurkeyPassword(
        `已恢复正常身份，${blockName} 解锁密码已公布`,
        "penalty"
      );
      if (password) state.status = `已恢复正常身份，${blockName} 解锁密码已公布`;
    }
  } catch (error) {
    state.coldTurkey.penaltyStatus = `惩戒营 ${activePenaltyBlockName()} 锁同步失败：${error.message}`;
  } finally {
    penaltyLockReconcileInFlight = false;
    broadcast();
  }
}

function saveEntertainmentGuard() {
  if (!state.entertainment.guard.active) {
    try {
      fs.unlinkSync(entertainmentGuardPath());
    } catch {
      // No persisted guard state.
    }
    return;
  }
  fs.writeFileSync(
    entertainmentGuardPath(),
    JSON.stringify({
      version: 1,
      endsAt: state.entertainment.guard.endsAt,
      blockName: state.entertainment.guard.blockName
    }, null, 2),
    "utf8"
  );
}

function clearEntertainmentGuard(message = "24 小时娱乐限制已结束") {
  clearInterval(entertainmentGuardTimer);
  entertainmentGuardTimer = null;
  state.entertainment.guard = {
    ...state.entertainment.guard,
    active: false,
    endsAt: 0,
    remainingSeconds: 0
  };
  saveEntertainmentGuard();
  const password = revealColdTurkeyPassword(message, "guard");
  if (password) state.status = message;
}

function entertainmentGuardTick() {
  if (!state.entertainment.guard.active) return;
  const remainingSeconds = Math.max(
    0,
    Math.ceil((state.entertainment.guard.endsAt - Date.now()) / 1000)
  );
  state.entertainment.guard.remainingSeconds = remainingSeconds;
  if (remainingSeconds === 0) {
    clearEntertainmentGuard();
    if (state.entertainment.active) stopEntertainment("24 小时限制已结束，娱乐模式已停止");
  }
  broadcast();
}

async function restoreEntertainmentGuard() {
  try {
    const saved = JSON.parse(fs.readFileSync(entertainmentGuardPath(), "utf8"));
    const endsAt = Number(saved.endsAt || 0);
    const blockName = validateBlockName(saved.blockName);
    if (endsAt <= Date.now()) {
      clearEntertainmentGuard();
      return;
    }
    state.entertainment.guard = {
      active: true,
      endsAt,
      remainingSeconds: Math.ceil((endsAt - Date.now()) / 1000),
      blockName
    };
    if (!fs.existsSync(coldTurkeySessionPath("guard"))) {
      await startColdTurkeyPasswordLock(blockName, "guard");
    }
    clearInterval(entertainmentGuardTimer);
    entertainmentGuardTimer = setInterval(entertainmentGuardTick, 1000);
  } catch {
    state.entertainment.guard = {
      ...state.entertainment.guard,
      active: false,
      endsAt: 0,
      remainingSeconds: 0
    };
  }
}

async function requestAiClassification(
  content,
  { modality = "text", fallback = false, maxOutputTokens = 120 } = {}
) {
  const api = getCompatibleApiConfig();
  const convertedContent = content.map((item) => {
    if (item.type === "input_text") return { type: "text", text: item.text };
    if (item.type === "input_image") {
      return {
        type: "image_url",
        image_url: { url: item.image_url, detail: item.detail }
      };
    }
    return item;
  });
  const messageContent = modality === "text"
    ? convertedContent.map((item) => item.text || "").join("\n")
    : convertedContent;
  const baseUrl = modality === "vision" ? api.visionBaseUrl : api.textBaseUrl;
  const endpoint = compatibleEndpoint(baseUrl, "chat/completions");
  const model = modality === "vision" ? api.visionModel : api.textModel;
  const apiKey = getCompatibleApiKey(modality);
  if (!model) throw new Error(`${modality === "vision" ? "视觉" : "文字"}模型未配置`);
  if (!apiKey) throw new Error(`${modality === "vision" ? "视觉" : "文字"} API Key 未配置`);
  const request = async (tokenParameter) => fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      ...completionTokenBody(maxOutputTokens, tokenParameter),
      messages: [{ role: "user", content: messageContent }]
    })
  });

  let tokenParameter = "max_completion_tokens";
  let response = await request(tokenParameter);
  if (!response.ok) {
    let detail = (await response.text()).slice(0, 1000);
    const alternate = response.status === 400
      ? alternateTokenParameter(detail, tokenParameter)
      : "";
    if (alternate) {
      tokenParameter = alternate;
      response = await request(tokenParameter);
      if (response.ok) {
        detail = "";
      } else {
        detail = (await response.text()).slice(0, 1000);
      }
    }
    if (response.ok) {
      // Continue with the successful compatibility retry.
    } else {
      detail = detail.slice(0, 300);
      throw new Error(`${api.providerName} API ${response.status}${detail ? `：${detail}` : ""}`);
    }
  }

  const payload = await response.json();
  const text = extractChatCompletionText(payload).trim();
  if (!text) {
    throw new Error(`${api.providerName} 返回了空响应：${summarizeCompatibleResponse(payload)}`);
  }
  recordAiUsage("content", api.providerName, model, { fallback });
  state.aiUsage.content.modality = modality;
  return text;
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

async function requestTextModel(prompt, { format, maxOutputTokens } = {}) {
  const modelConfig = (state.running || state.entertainment.active)
    ? state.config
    : state.settings.preferences;
  const ollamaRequested = modelConfig.ollamaEnabled;
  const useOllama = ollamaRequested
    && state.ollama.available
    && hasModel(state.ollama, modelConfig.ollamaTextModel);
  if (useOllama) {
    try {
      const text = await ollamaChat({
        model: modelConfig.ollamaTextModel,
        prompt,
        format
      });
      recordAiUsage("content", "Ollama", modelConfig.ollamaTextModel);
      state.aiUsage.content.modality = "text";
      return text;
    } catch (error) {
      if (!modelConfig.ollamaFallbackToOpenAi) throw error;
    }
  }
  if (ollamaRequested && !useOllama && !modelConfig.ollamaFallbackToOpenAi) {
    throw new Error(`本地文字模型 ${modelConfig.ollamaTextModel} 不可用`);
  }
  if (!getCompatibleApiKey("text")) {
    throw new Error("本地文字模型不可用，且没有配置兼容 API Key");
  }
  return requestAiClassification(
    [{ type: "input_text", text: prompt }],
    { modality: "text", fallback: Boolean(ollamaRequested), maxOutputTokens }
  );
}

async function requestVisionModel(prompt, imageBase64, { format, mimeType = "image/jpeg" } = {}) {
  const modelConfig = (state.running || state.entertainment.active)
    ? state.config
    : state.settings.preferences;
  const ollamaRequested = modelConfig?.ollamaEnabled;
  const useOllama = ollamaRequested
    && state.ollama.available
    && hasModel(state.ollama, modelConfig.ollamaVisionModel);
  if (useOllama) {
    try {
      const text = await ollamaChat({
        model: modelConfig.ollamaVisionModel,
        prompt,
        imageBase64,
        format
      });
      recordAiUsage("content", "Ollama", modelConfig.ollamaVisionModel);
      state.aiUsage.content.modality = "vision";
      return text;
    } catch (error) {
      if (!modelConfig.ollamaFallbackToOpenAi) throw error;
    }
  }
  if (ollamaRequested && !useOllama && !modelConfig.ollamaFallbackToOpenAi) {
    throw new Error(`本地视觉模型 ${modelConfig.ollamaVisionModel} 不可用`);
  }
  if (!getCompatibleApiKey("vision")) {
    throw new Error("本地视觉模型不可用，且没有配置兼容 API Key");
  }
  return requestAiClassification(
    [
      { type: "input_text", text: prompt },
      {
        type: "input_image",
        image_url: `data:${mimeType};base64,${imageBase64}`,
        detail: modelConfig?.visionQuality === "standard" ? "low" : "high"
      }
    ],
    { modality: "vision", fallback: Boolean(ollamaRequested) }
  );
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

async function generateEntertainmentCommentary() {
  if (!state.entertainment.active || entertainmentCommentaryInFlight || !entertainmentSession) return;
  const session = entertainmentSession;
  entertainmentCommentaryInFlight = true;
  try {
    const [activity, screenshot] = await Promise.all([
      getActiveWindow(),
      capturePrimaryScreen()
    ]);
    if (!screenshot || !state.entertainment.active || entertainmentSession?.id !== session.id) return;
    const text = await requestVisionModel(
      buildEntertainmentPrompt(state.settings.personalityPrompt, activity, session.memory),
      screenshot
    );
    if (!state.entertainment.active || entertainmentSession?.id !== session.id) return;
    const commentary = sanitizeCommentary(text);
    if (!commentary) return;
    session.memory.push({
      processName: activity.processName || "",
      title: activity.title || "",
      commentary
    });
    session.memory = session.memory.slice(-MAX_ENTERTAINMENT_MEMORY_TURNS);
    state.entertainment.memoryTurns = session.memory.length;
    state.latest = {
      at: new Date().toISOString(),
      verdict: "entertainment",
      reason: commentary
    };
    state.status = `娱乐点评：${commentary}`;
    broadcast();
    await speakCommissar(commentary);
    if (state.entertainment.active && entertainmentSession?.id === session.id) {
      lastEntertainmentCommentaryAt = Date.now();
    }
  } catch (error) {
    if (state.entertainment.active && entertainmentSession?.id === session.id) {
      state.status = `娱乐点评暂不可用：${error.message}`;
      broadcast();
    }
  } finally {
    if (!entertainmentSession || entertainmentSession.id === session.id) {
      entertainmentCommentaryInFlight = false;
    }
  }
}

function entertainmentTick() {
  if (!state.entertainment.active) return;
  if (state.entertainment.paid) {
    state.entertainment.remainingSeconds = Math.max(
      0,
      Math.ceil((state.entertainment.endsAt - Date.now()) / 1000)
    );
    if (state.entertainment.remainingSeconds === 0) {
      void stopEntertainment("本次娱乐津贴已用完");
      return;
    }
  }
  state.entertainment.elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - state.entertainment.startedAt) / 1000)
  );
  if (!state.entertainment.commentaryEnabled) {
    broadcast();
    return;
  }
  const intervalMs = state.entertainment.intervalSeconds * 1000;
  if (Date.now() - lastEntertainmentCommentaryAt >= intervalMs) {
    lastEntertainmentCommentaryAt = Date.now();
    void generateEntertainmentCommentary();
  }
  broadcast();
}

async function stopEntertainment(message = "娱乐模式已停止", { relock = true } = {}) {
  if (entertainmentStopping) return publicState();
  entertainmentStopping = true;
  clearInterval(entertainmentTimer);
  entertainmentTimer = null;
  entertainmentSession = null;
  entertainmentCommentaryInFlight = false;
  const shouldRelock = relock && state.entertainment.paid && state.entertainment.guard.active;
  state.entertainment = {
    ...state.entertainment,
    active: false,
    endsAt: 0,
    remainingSeconds: 0,
    paid: false,
    costPoints: 0,
    memoryTurns: 0
  };
  state.status = message;
  if (shouldRelock) {
    try {
      await relockEntertainmentGuard();
    } catch (error) {
      state.status = `娱乐已停止，但 Cold Turkey 重新锁定失败：${error.message}`;
    }
  }
  entertainmentStopping = false;
  broadcast();
  return publicState();
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
    "只有证据描述了具体交付物、可核验位置或明确完成结果时才通过。",
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

async function generateDailyPlan(sourceTasks) {
  const tasks = String(sourceTasks || "").trim();
  if (tasks.length < 3) throw new Error("请先写下今天要做的任务。");
  const existingItems = state.dailyPlan.items || [];
  const isAppend = existingItems.length > 0;
  if (existingItems.length >= 12) throw new Error("今日计划已达到 12 项上限。");
  const prompt = [
    "你是一名务实的每日计划助手。",
    isAppend
      ? `今日已有计划：\n${existingItems.map((item) => `- ${item.title}`).join("\n")}`
      : "",
    `用户${isAppend ? "临时追加" : "今天想做"}的事情：\n${tasks}`,
    isAppend
      ? "只把新增内容整理为 1 至 5 个行动项，不要重复已有计划。"
      : "将内容整理为 3 至 10 个今天可以完成、边界清晰、可由文字或截图自行证明完成的行动项。",
    "不要擅自加入用户没有要求的大型目标。可以合理排序，并给出简短执行说明和建议时间。",
    "完成标准必须能由用户自行提交的截图、文件位置、数量、运行结果或笔记证明。",
    '只返回 JSON：{"items":[{"title":"任务名","details":"完成标准","suggestedTime":"建议时段或时长"}]}。'
  ].join("\n");
  const text = await requestTextModel(prompt, {
    maxOutputTokens: 900,
    format: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              details: { type: "string" },
              suggestedTime: { type: "string" }
            },
            required: ["title", "details", "suggestedTime"]
          }
        }
      },
      required: ["items"]
    }
  });
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error("AI 未能生成有效计划，请稍后重试。");
  const parsed = JSON.parse(json);
  const generatedItems = normalizePlanItems(parsed.items).map((item) => ({
    ...item,
    id: crypto.randomUUID()
  }));
  const merged = appendPlanItems(existingItems, generatedItems);
  if (merged.addedCount === 0) throw new Error("没有发现可追加的新目标，可能与现有计划重复或已达上限。");
  state.dailyPlan = {
    ...state.dailyPlan,
    date: localDateKey(),
    sourceTasks: [state.dailyPlan.sourceTasks, tasks].filter(Boolean).join("\n").slice(0, 4000),
    items: merged.items,
    generatedAt: state.dailyPlan.generatedAt || Date.now(),
    status: isAppend
      ? `已追加 ${merged.addedCount} 项，今日共 ${merged.items.length} 项`
      : `今日计划已生成，共 ${merged.items.length} 项`
  };
  saveDailyPlan();
}

async function reviewDailyPlanEvidence(item, evidence, evidenceImageDataUrl) {
  const proof = String(evidence || "").trim();
  const evidenceImage = parseEvidenceImageDataUrl(evidenceImageDataUrl);
  if (!evidenceImage && proof.length < 20) {
    return { accepted: false, reason: "证据过于简略，请说明成果、位置或验收结果。" };
  }
  const prompt = [
    "你负责审核一项每日计划是否确实完成。",
    `计划项：${item.title}`,
    `完成标准：${item.details || "未额外说明"}`,
    `用户文字证据：${proof || "未提供，请主要审核截图"}`,
    evidenceImage
      ? "用户同时提交了一张证据截图。请认真读取截图中的界面、文字、数量、完成状态或成果。"
      : "用户没有提交截图。",
    "只有文字或截图能够具体证明成果、可核验位置、数量或明确完成结果时才通过。",
    "截图与计划项明显无关、内容不可读或无法证明完成时不得通过。",
    '只返回 JSON：{"accepted":true|false,"reason":"不超过50字"}。'
  ].join("\n");
  const format = {
    type: "object",
    properties: {
      accepted: { type: "boolean" },
      reason: { type: "string" }
    },
    required: ["accepted", "reason"]
  };
  const text = evidenceImage
    ? await requestVisionModel(prompt, evidenceImage.base64, {
      format,
      mimeType: evidenceImage.mimeType
    })
    : await requestTextModel(prompt, { maxOutputTokens: 180, format });
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { accepted: false, reason: "AI 未能读懂证据，请写得更具体。" };
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

function isValidWavFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, header, 0, 12, 0);
    return bytesRead >= 12
      && header.toString("ascii", 0, 4) === "RIFF"
      && header.toString("ascii", 8, 12) === "WAVE";
  } catch {
    return false;
  } finally {
    if (fd) fs.closeSync(fd);
  }
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

function fileUri(filePath) {
  return new URL(`file:///${filePath.replace(/\\/g, "/")}`).href;
}

function playMedia(filePath) {
  if (path.extname(filePath).toLowerCase() === ".wav") return playWav(filePath);
  const escapedUri = fileUri(filePath).replaceAll("'", "''");
  const command = [
    "Add-Type -AssemblyName PresentationCore;",
    "$player = New-Object System.Windows.Media.MediaPlayer;",
    `$player.Open([Uri]'${escapedUri}');`,
    "$deadline = (Get-Date).AddSeconds(10);",
    "while (-not $player.NaturalDuration.HasTimeSpan -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 100 };",
    "if (-not $player.NaturalDuration.HasTimeSpan) { throw '无法读取音频时长'; };",
    "$player.Play();",
    "Start-Sleep -Milliseconds ([Math]::Min(60000, [Math]::Max(500, [int]$player.NaturalDuration.TimeSpan.TotalMilliseconds + 300)));",
    "$player.Close();"
  ].join(" ");
  return execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { windowsHide: true, timeout: 70000 }
  );
}

function audioExtensionFrom(contentType = "", sourceUrl = "") {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("mpeg") || type.includes("mp3")) return ".mp3";
  if (type.includes("wav") || type.includes("wave")) return ".wav";
  if (type.includes("ogg")) return ".ogg";
  if (type.includes("aac")) return ".aac";
  try {
    const ext = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if ([".mp3", ".wav", ".ogg", ".aac", ".m4a"].includes(ext)) return ext;
  } catch {
    // The URL may be absent or relative.
  }
  return ".mp3";
}

async function speakWithOpenAi(text, voice = "onyx", speed = 1.1) {
  const normalizedSpeed = normalizeTtsSpeed(speed);
  const api = getCompatibleApiConfig();
  const apiKey = getCompatibleApiKey("tts");
  if (!apiKey || !api.ttsModel) return;
  const cacheDir = path.join(app.getPath("userData"), "voice-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const personalityPrompt = state.settings.personalityPrompt;
  const hash = crypto.createHash("sha256")
    .update(`${api.ttsBaseUrl}:${api.ttsModel}:${voice}:${normalizedSpeed}:${personalityPrompt}:${text}`)
    .digest("hex")
    .slice(0, 20);
  const audioPath = path.join(cacheDir, `${hash}.wav`);

  if (!fs.existsSync(audioPath)) {
    const response = await fetch(compatibleEndpoint(api.ttsBaseUrl, "audio/speech"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: api.ttsModel,
        voice,
        input: text,
        speed: normalizedSpeed,
        response_format: "wav"
      })
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`${api.providerName} TTS ${response.status}${detail ? `：${detail}` : ""}`);
    }
    fs.writeFileSync(audioPath, Buffer.from(await response.arrayBuffer()));
  }

  await playWav(audioPath);
  recordAiUsage("speech", api.providerName, api.ttsModel);
  broadcast();
}

function qwenTtsAudioUrl(payload) {
  return payload?.output?.audio?.url
    || payload?.output?.audio_url
    || payload?.output?.url
    || payload?.url
    || "";
}

function qwenTtsAudioData(payload) {
  return payload?.output?.audio?.data
    || payload?.output?.audio_data
    || payload?.audio?.data
    || "";
}

async function speakWithQwenTts(text, voice, speed = 1.1) {
  const api = getCompatibleApiConfig();
  const apiKey = getCompatibleApiKey("tts");
  if (!apiKey || !api.ttsModel) return;
  const normalizedSpeed = normalizeTtsSpeed(speed);
  const endpoint = compatibleEndpoint(api.ttsBaseUrl, "services/aigc/multimodal-generation/generation");
  const cacheDir = path.join(app.getPath("userData"), "voice-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const hash = crypto.createHash("sha256")
    .update(`qwen:${api.ttsBaseUrl}:${api.ttsModel}:${voice}:${normalizedSpeed}:${text}`)
    .digest("hex")
    .slice(0, 20);
  let audioPath = "";
  const cached = fs.readdirSync(cacheDir).find((file) => file.startsWith(`${hash}.`));
  if (cached) audioPath = path.join(cacheDir, cached);
  if (audioPath && path.extname(audioPath).toLowerCase() === ".wav" && !isValidWavFile(audioPath)) {
    fs.rmSync(audioPath, { force: true });
    audioPath = "";
  }

  if (!audioPath || !fs.existsSync(audioPath)) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: api.ttsModel,
        input: {
          text,
          voice,
          language_type: "Chinese"
        }
      })
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Qwen-TTS ${response.status}${detail ? `：${detail}` : ""}`);
    }
    const payload = await response.json();
    const audioData = qwenTtsAudioData(payload);
    if (audioData) {
      audioPath = path.join(cacheDir, `${hash}.wav`);
      fs.writeFileSync(audioPath, Buffer.from(audioData, "base64"));
    } else {
      const audioUrl = qwenTtsAudioUrl(payload);
      if (!audioUrl) throw new Error("Qwen-TTS 未返回音频 URL");
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Qwen-TTS 音频下载失败 ${audioResponse.status}`);
      }
      const extension = audioExtensionFrom(audioResponse.headers.get("content-type"), audioUrl);
      audioPath = path.join(cacheDir, `${hash}${extension}`);
      fs.writeFileSync(audioPath, Buffer.from(await audioResponse.arrayBuffer()));
    }
  }

  await playMedia(audioPath);
  recordAiUsage("speech", "Qwen-TTS", api.ttsModel);
  broadcast();
}

async function speakCommissar(text) {
  const voice = state.config?.ttsVoice || "onyx";
  const speed = state.config?.ttsSpeed;
  const speechTask = speechQueue.then(async () => {
    const api = getCompatibleApiConfig();
    if (!getCompatibleApiKey("tts") || !api.ttsModel) return;
    if (api.ttsProvider === "qwen") {
      await speakWithQwenTts(text, voice, speed);
    } else {
      await speakWithOpenAi(text, voice, speed);
    }
  }).catch((error) => {
    state.status = `AI 语音暂不可用：${error.message}`;
    broadcast();
  });
  speechQueue = speechTask;
  return speechTask;
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

async function testConfiguredModel(kind, config = {}) {
  const previousConfig = state.config;
  state.config = normalizePreferences({
    ...state.settings.preferences,
    ...config
  });
  try {
    const api = getCompatibleApiConfig(state.config);
    if (kind === "text") {
      const output = await requestTextModel(
        "请只回复：文字模型测试成功",
        { maxOutputTokens: 40 }
      );
      return {
        ok: true,
        kind,
        provider: api.providerName,
        baseUrl: api.textBaseUrl,
        model: api.textModel,
        message: output.slice(0, 160)
      };
    }
    if (kind === "vision") {
      const screenshot = await capturePrimaryScreen();
      if (!screenshot) throw new Error("无法截取主屏幕");
      const output = await requestVisionModel(
        "请用不超过30个字描述这张截图，并以“视觉模型测试成功：”开头。",
        screenshot
      );
      return {
        ok: true,
        kind,
        provider: api.providerName,
        baseUrl: api.visionBaseUrl,
        model: api.visionModel,
        message: output.slice(0, 160)
      };
    }
    if (kind === "speech") {
      await speakCommissar("语音模型测试成功，当前语音服务已经接通。");
      return {
        ok: true,
        kind,
        provider: api.ttsProvider === "qwen" ? "Qwen-TTS" : api.providerName,
        baseUrl: api.ttsBaseUrl,
        model: api.ttsModel,
        message: "已发送语音试听"
      };
    }
    throw new Error("未知测试类型");
  } finally {
    state.config = previousConfig;
  }
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
    revealColdTurkeyPassword("任务自然完成，可用密码提前停止 block", "focus");
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
    && (getCompatibleApiKey("vision") || (state.config.ollamaEnabled && state.ollama.available))
    && Date.now() - lastProgressCommentaryAt >= commentaryIntervalMs
    && Date.now() - lastVisionAiCheckAt >= VISION_CHECK_INTERVAL_MS;
  if (commentaryDue) {
    lastProgressCommentaryAt = Date.now();
    void generateProgressCommentary(activity);
  }

  let result = classifyActivity(activity, state.config);
  const canUseAi = state.config.aiEnabled
    && (getCompatibleApiKey("text") || (state.config.ollamaEnabled && state.ollama.available));
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

  const warningTransition = advanceDistractionWarning({
    warningCount: state.distractionWarnings,
    focusedCount: state.focusedSinceWarning
  }, result.verdict);
  state.distractionWarnings = warningTransition.warningCount;
  state.focusedSinceWarning = warningTransition.focusedCount;
  state.consecutiveDistracted = warningTransition.warningCount;
  state.intervention = nextIntervention(state.consecutiveDistracted);
  state.latest = { ...activity, ...result, at: new Date().toISOString() };
  addHistory(state.latest);

  if (warningTransition.warned) {
    state.status = `首次偏离警告：${result.reason}`;
    notify("先回来一下", `你现在的任务是：${state.task}`);
    if (state.config.voiceEnabled) void speakPersonalizedReminder();
  } else if (warningTransition.penalize) {
    sessionDistractionCount += 1;
    const deducted = deductForDistraction();
    state.status = `第二次偏离，扣除 ${deducted} 点；警告次数已重置：${result.reason}`;
    notify("再次偏离", `扣除 ${deducted} 点，警告次数已重置。`);
    if (state.config.voiceEnabled) {
      void speakCommissar(`再次检测到偏离，扣除 ${deducted} 点。警告次数已重置。`);
    }
  } else if (warningTransition.clearedByFocus) {
    state.status = `连续推进 5 次，偏离警告已清除：${result.reason}`;
  } else {
    state.status = result.reason;
  }
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
    distractionWarnings: 0,
    focusedSinceWarning: 0,
    intervention: "none",
    status: message
  };
  if (blockerWindow && !blockerWindow.isDestroyed()) blockerWindow.close();
  broadcast();
  return publicState();
}

function forceStopSession(reason, message) {
  deductForForcedExit(reason);
  const password = revealColdTurkeyPassword(
    "已强制结束，本轮 Cold Turkey 密码已公布；解除后请确认",
    "focus"
  );
  stopSession(message);
  return password;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 640,
    backgroundColor: "#f4f1e8",
    title: "ОГАС政委",
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
      forceStopSession("关闭应用时强行退出", "已强行退出，扣除 3 点；Cold Turkey 密码已公布");
      allowWindowClose = true;
      mainWindow.close();
    }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("state:get", () => publicState());
ipcMain.handle("model:test", async (_, kind, config) => {
  try {
    const result = await testConfiguredModel(kind, config);
    state.status = `${result.kind} 测试成功：${result.model}`;
    broadcast();
    return { ...publicState(), modelTest: result };
  } catch (error) {
    const result = {
      ok: false,
      kind,
      message: error.message
    };
    state.status = `模型测试失败：${error.message}`;
    broadcast();
    return { ...publicState(), modelTest: result };
  }
});
ipcMain.handle("external:winter-supervision:open", async () => {
  const url = "https://redwatch.top/";
  await shell.openExternal(url);
  return { opened: true, url };
});
ipcMain.handle("session:start", async (_, config) => {
  if (state.entertainment.active) return publicState();
  const coldTurkeyReady = coldTurkeyAvailable() && safeStorage.isEncryptionAvailable();
  const wantsColdTurkey = Boolean(config.coldTurkeyEnabled && coldTurkeyReady);
  const reuseEntertainmentGuardLock = Boolean(
    state.entertainment.guard.active && wantsColdTurkey
  );
  const durationMinutes = Math.max(5, Math.min(240, Number(config.durationMinutes) || 25));
  if (wantsColdTurkey && !reuseEntertainmentGuardLock) {
    try {
      await startColdTurkeyPasswordLock(config.coldTurkeyBlockName || "AI Commissar");
    } catch (error) {
      state.status = error.message;
      broadcast();
      return publicState();
    }
  } else {
    state.coldTurkey.passwordRevealed = "";
    state.coldTurkey.focusEndsAt = 0;
    state.coldTurkey.status = "本轮未启用";
  }
  state = {
    ...state,
    running: true,
    task: String(config.task || "推进当前任务").trim(),
    remainingSeconds: durationMinutes * 60,
    consecutiveDistracted: 0,
    distractionWarnings: 0,
    focusedSinceWarning: 0,
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
      visionQuality: normalizeVisionQuality(config.visionQuality),
      ttsVoice: ["onyx", "echo", "ash"].includes(config.ttsVoice) ? config.ttsVoice : "onyx",
      ttsSpeed: normalizeTtsSpeed(config.ttsSpeed),
      textModel: config.textModel || config.aiModel || "gpt-5.4-mini",
      visionModel: config.visionModel || config.aiModel || config.textModel || "gpt-5.4-mini",
      aiModel: config.textModel || config.aiModel || "gpt-5.4-mini",
      ttsModel: String(config.ttsModel || "").trim()
    },
    status: config.coldTurkeyEnabled && !coldTurkeyReady
      ? "专注会话已开始；未检测到可用 Cold Turkey，已跳过密码锁"
      : reuseEntertainmentGuardLock
      ? "专注会话已开始；沿用 24 小时娱乐限制的 Cold Turkey 锁"
      : "专注会话已开始",
    history: []
  };
  sessionEndsAt = Date.now() + durationMinutes * 60000;
  if (wantsColdTurkey && !reuseEntertainmentGuardLock) {
    state.coldTurkey.focusEndsAt = sessionEndsAt;
    state.coldTurkey.status = "密码锁已启用；本轮结束时由应用公布密码";
  } else if (reuseEntertainmentGuardLock) {
    state.coldTurkey.focusEndsAt = 0;
    state.coldTurkey.status = "24 小时娱乐限制锁保持启用；本轮专注不创建新密码";
  } else if (config.coldTurkeyEnabled && !coldTurkeyReady) {
    state.coldTurkey.active = false;
    state.coldTurkey.focusEndsAt = 0;
    state.coldTurkey.status = coldTurkeyAvailable()
      ? "Windows 安全存储不可用，已跳过 Cold Turkey 密码锁"
      : "未安装 Cold Turkey，已跳过密码锁";
  }
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
ipcMain.handle("entertainment:start", async (_, config) => {
  if (state.running || state.entertainment.active) return publicState();
  ensureEntertainmentLedgerCurrent();
  state.rewards = normalizeRewards(state.rewards);
  const access = entertainmentAccess(state.rewards, state.entertainmentLedger);
  const durationMinutes = Math.max(5, Math.min(240, Number(config.durationMinutes) || 30));
  const costPoints = entertainmentCost(durationMinutes);
  if (access.blockedByPenalty) {
    state.status = "惩戒营状态不能开启娱乐模式";
    broadcast();
    return publicState();
  }
  if (!access.focusRequirementMet) {
    state.status = `工作日累计专注不足 3 小时：今日已完成 ${access.focusedMinutes} 分钟`;
    broadcast();
    return publicState();
  }
  if (access.remainingMinutes !== null && durationMinutes > access.remainingMinutes) {
    state.status = `今日娱乐津贴不足：余额 ${access.remainingMinutes} 分钟`;
    broadcast();
    return publicState();
  }
  if (state.rewards.points < costPoints) {
    state.status = `积分不足：${durationMinutes} 分钟需要 ${costPoints} 点，当前 ${state.rewards.points} 点`;
    broadcast();
    return publicState();
  }
  const entertainmentConfig = normalizeEntertainmentConfig(config);
  const canUseVision = getCompatibleApiKey("vision")
    || (entertainmentConfig.ollamaEnabled && state.ollama.available);
  if (entertainmentConfig.commentaryEnabled && !canUseVision) {
    state.status = "娱乐模式需要兼容 API 或可用的 Ollama 视觉模型";
    broadcast();
    return publicState();
  }
  if (state.entertainment.guard.active) {
    const guardRemainingMinutes = Math.floor(
      (state.entertainment.guard.endsAt - Date.now()) / 60000
    );
    if (guardRemainingMinutes < durationMinutes) {
      state.status = `24 小时限制仅剩 ${Math.max(0, guardRemainingMinutes)} 分钟，无法兑换 ${durationMinutes} 分钟`;
      broadcast();
      return publicState();
    }
    try {
      if (!fs.existsSync(coldTurkeySessionPath("guard"))) {
        await relockEntertainmentGuard();
      }
      const password = revealColdTurkeyPassword(
        `已兑换 ${durationMinutes} 分钟娱乐津贴，请用此密码暂停 block`,
        "guard"
      );
      if (!password) throw new Error("没有可用的 Cold Turkey 解锁密码");
      state.rewards = redeemEntertainment(state.rewards, durationMinutes);
      saveRewards();
    } catch (error) {
      state.status = `娱乐兑换失败：${error.message}`;
      broadcast();
      return publicState();
    }
  } else {
    state.rewards = redeemEntertainment(state.rewards, durationMinutes);
    saveRewards();
  }
  state.entertainmentLedger.redeemedMinutes += durationMinutes;
  saveEntertainmentLedger();
  state.config = {
    ...(state.config || {}),
    ...entertainmentConfig
  };
  state.entertainment = {
    active: true,
    startedAt: Date.now(),
    elapsedSeconds: 0,
    endsAt: Date.now() + durationMinutes * 60 * 1000,
    remainingSeconds: durationMinutes * 60,
    paid: true,
    costPoints,
    commentaryEnabled: entertainmentConfig.commentaryEnabled,
    intervalSeconds: entertainmentConfig.intervalSeconds,
    memoryTurns: 0,
    guard: state.entertainment.guard
  };
  entertainmentSession = {
    id: crypto.randomUUID(),
    memory: []
  };
  state.latest = null;
  state.status = state.entertainment.guard.active
    ? `已消费 ${costPoints} 点，获得 ${durationMinutes} 分钟娱乐津贴；Cold Turkey 密码已显示`
    : `已消费 ${costPoints} 点，获得 ${durationMinutes} 分钟娱乐津贴`;
  lastEntertainmentCommentaryAt = Date.now();
  clearInterval(entertainmentTimer);
  entertainmentTimer = setInterval(entertainmentTick, 1000);
  entertainmentTick();
  broadcast();
  return publicState();
});
ipcMain.handle("entertainment:stop", async () => {
  if (state.entertainment.active) return stopEntertainment();
  return publicState();
});

ipcMain.handle("entertainment:guard:start", async (_, blockName) => {
  const requestedBlockName = String(blockName || "AI Commissar").trim();
  const penaltyBlock = activePenaltyBlockName();
  if (
    normalizeRewards(state.rewards).rank === "惩戒营"
    && requestedBlockName.toLowerCase() === penaltyBlock.toLowerCase()
  ) {
    state.status = `惩戒营正在使用 ${penaltyBlock} 锁，请为 24 小时娱乐限制选择另一个 Cold Turkey Block`;
    broadcast();
    return publicState();
  }
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "开启 24 小时娱乐限制",
      message: "接下来 24 小时，娱乐只能使用津贴开启",
      detail: "Cold Turkey 将立即用随机密码锁定指定 Block。请确认该 Block 已包含需要限制的游戏和娱乐网站。提前恢复密码会按异常中止扣除 3 点。",
      buttons: ["取消", "确认开启 24 小时限制"],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (result.response !== 1) return publicState();
    await activateEntertainmentGuard(requestedBlockName);
  } catch (error) {
    state.status = `24 小时娱乐限制开启失败：${error.message}`;
  }
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
      const password = revealColdTurkeyPassword("证据通过，可用密码提前停止 block", "focus");
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
    forceStopSession("手动强行停止", "已强行停止，扣除 3 点；Cold Turkey 密码已公布");
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
    if (state.entertainment.guard.active) {
      state.entertainment.guard.active = false;
      saveEntertainmentGuard();
      clearInterval(entertainmentGuardTimer);
    }
    broadcast();
  }
  return publicState();
});
ipcMain.handle("cold-turkey:confirm-unlocked", () => {
  confirmColdTurkeyFocusUnlocked();
  broadcast();
  return publicState();
});
ipcMain.handle("cold-turkey:reveal-previous", () => {
  revealPreviousColdTurkeyPassword();
  broadcast();
  return publicState();
});
ipcMain.handle("voice:preview", async (_, options = {}) => {
  const selectedVoice = String(options.voice || state.settings.preferences.ttsVoice || "onyx").trim().slice(0, 180) || "onyx";
  const previousVoice = state.config?.ttsVoice;
  const previousSpeed = state.config?.ttsSpeed;
  const previousProvider = state.config?.ttsProvider;
  const previousBaseUrl = state.config?.ttsApiBaseUrl;
  const previousModel = state.config?.ttsModel;
  state.config = {
    ...(state.config || {}),
    ttsVoice: selectedVoice,
    ttsSpeed: normalizeTtsSpeed(options.speed),
    ttsProvider: options.ttsProvider === "qwen" ? "qwen" : "openai",
    ttsApiBaseUrl: String(options.ttsApiBaseUrl || state.settings.preferences.ttsApiBaseUrl || "").trim(),
    ttsModel: String(options.ttsModel ?? state.settings.preferences.ttsModel ?? "").trim()
  };
  await speakCommissar(await generateCommissarLine());
  if (previousVoice) state.config.ttsVoice = previousVoice;
  else delete state.config.ttsVoice;
  if (previousSpeed) state.config.ttsSpeed = previousSpeed;
  else delete state.config.ttsSpeed;
  if (previousProvider) state.config.ttsProvider = previousProvider;
  else delete state.config.ttsProvider;
  if (previousBaseUrl) state.config.ttsApiBaseUrl = previousBaseUrl;
  else delete state.config.ttsApiBaseUrl;
  if (previousModel) state.config.ttsModel = previousModel;
  else delete state.config.ttsModel;
  return publicState();
});
ipcMain.handle("settings:personality:save", (_, prompt) => {
  const personalityPrompt = String(prompt || "").trim().slice(0, 2000);
  if (!personalityPrompt) return publicState();
  state.settings.personalityPrompt = personalityPrompt;
  saveSettings();
  state.status = "人格 Prompt 已保存";
  broadcast();
  return publicState();
});
ipcMain.handle("settings:personality:reset", () => {
  state.settings.personalityPrompt = DEFAULT_PERSONALITY_PROMPT;
  saveSettings();
  state.status = "已恢复默认人格";
  broadcast();
  return publicState();
});
ipcMain.handle("settings:preferences:save", (_, preferences) => {
  state.settings.preferences = normalizePreferences(preferences);
  saveSettings();
  return publicState();
});
ipcMain.handle("settings:api-key:save", (_, scope, apiKey) => {
  const keyScope = normalizeApiKeyScope(scope);
  try {
    saveCompatibleApiKey(keyScope, apiKey);
    state.status = String(apiKey || "").trim()
      ? `${keyScope.toUpperCase()} API Key 已加密保存`
      : `${keyScope.toUpperCase()} API Key 已清除`;
  } catch (error) {
    state.status = error.message;
  }
  broadcast();
  return publicState();
});
ipcMain.handle("settings:api-key:copy", (_, fromScope, toScope) => {
  try {
    copyCompatibleApiKey(fromScope, toScope);
    state.status = `${normalizeApiKeyScope(fromScope).toUpperCase()} API Key 已同步到 ${normalizeApiKeyScope(toScope).toUpperCase()}`;
  } catch (error) {
    state.status = error.message;
  }
  broadcast();
  return publicState();
});
ipcMain.handle("daily-plan:generate", async (_, sourceTasks) => {
  ensureDailyPlanCurrent();
  try {
    await generateDailyPlan(sourceTasks);
    broadcast();
    return { ...publicState(), dailyPlanError: "" };
  } catch (error) {
    state.dailyPlan.status = `生成失败：${error.message}`;
    saveDailyPlan();
    broadcast();
    return { ...publicState(), dailyPlanError: error.message };
  }
});
ipcMain.handle("daily-plan:complete", async (_, itemId, evidence, evidenceImageDataUrl) => {
  ensureDailyPlanCurrent();
  const item = state.dailyPlan.items.find((entry) => entry.id === String(itemId || ""));
  if (!item) {
    return {
      ...publicState(),
      dailyPlanReview: { accepted: false, reason: "没有找到这项今日计划。" }
    };
  }
  if (item.completed) {
    return {
      ...publicState(),
      dailyPlanReview: { accepted: false, reason: "此项已经领取过奖励。" }
    };
  }
  try {
    const review = await reviewDailyPlanEvidence(item, evidence, evidenceImageDataUrl);
    if (review.accepted) {
      if (item.completed) {
        return {
          ...publicState(),
          dailyPlanReview: { accepted: false, reason: "此项已经领取过奖励。" }
        };
      }
      item.completed = true;
      item.completedAt = Date.now();
      state.dailyPlan.status = `已完成“${item.title}”，荣誉值 +1`;
      state.rewards = awardDailyPlanItem(state.rewards);
      saveRewards();
      saveDailyPlan();
      void reconcilePenaltyLock();
    }
    broadcast();
    return { ...publicState(), dailyPlanReview: review };
  } catch (error) {
    const review = { accepted: false, reason: `审核失败：${error.message}` };
    return { ...publicState(), dailyPlanReview: review };
  }
});
ipcMain.handle("session:checkin", (_, text) => {
  const note = String(text || "").trim();
  if (note) {
    state.consecutiveDistracted = 0;
    state.distractionWarnings = 0;
    state.focusedSinceWarning = 0;
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
  loadCompatibleApiKeys();
  loadDailyPlan();
  loadEntertainmentLedger();
  loadColdTurkeyRecovery();
  await restoreEntertainmentGuard();
  await reconcilePenaltyLock();
  clearInterval(penaltyLockTimer);
  penaltyLockTimer = setInterval(() => void reconcilePenaltyLock(), 30 * 1000);
  clearInterval(dailyPlanTimer);
  dailyPlanTimer = setInterval(dailyPlanTick, 30 * 1000);
  dailyPlanTick();
  state.ollama = {
    ...(await getOllamaStatus()),
    status: "检测完成"
  };
  createWindow();
  globalShortcut.register("CommandOrControl+Shift+F12", () => {
    if (!state.running) return;
    forceStopSession("紧急快捷键强行停止", "已紧急停止，扣除 3 点；Cold Turkey 密码已公布");
    notify("已紧急停止", "本轮扣除 3 点，Cold Turkey 密码已在应用中公布。");
  });
});

app.on("will-quit", () => {
  allowWindowClose = true;
  clearInterval(penaltyLockTimer);
  clearInterval(dailyPlanTimer);
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => {
  void stopEntertainment("应用已关闭", { relock: false });
  stopSession();
  if (process.platform !== "darwin") app.quit();
});
