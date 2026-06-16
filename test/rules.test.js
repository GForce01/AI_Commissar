const test = require("node:test");
const assert = require("node:assert/strict");
const {
  advanceDistractionWarning,
  classifyActivity,
  nextIntervention
} = require("../src/rules");
const { activityCacheKey, parseAiVerdict, sanitizeCommentary } = require("../src/ai-classifier");
const {
  generateColdTurkeyPassword,
  parseBlockStatus,
  SAFE_LOCK_MINUTES,
  safeTimedLockArgs,
  validateBlockName
} = require("../src/cold-turkey");
const { hasModel } = require("../src/ollama");
const {
  alternateTokenParameter,
  completionTokenBody,
  compatibleEndpoint,
  extractChatCompletionText,
  extractFirstJsonObject,
  isQwenCompatibleRequest,
  parseJsonObjectFromText,
  qwenThinkingBody,
  summarizeCompatibleResponse,
  normalizeApiBaseUrl
} = require("../src/openai-compatible");
const {
  MAX_PASSWORD_VAULT_ENTRIES,
  rotatePasswordVaultEntries
} = require("../src/password-vault");
const { normalizePreferences } = require("../src/settings");
const {
  appendPlanItems,
  emptyDailyPlan,
  localDateKey,
  normalizeDailyPlan,
  normalizePlanItems,
  parseEvidenceImageDataUrl
} = require("../src/daily-plan");
const {
  DEFAULT_ENTERTAINMENT_INTERVAL_SECONDS,
  MAX_ENTERTAINMENT_MEMORY_TURNS,
  buildEntertainmentPrompt,
  normalizeTtsSpeed,
  normalizeVisionQuality,
  normalizeEntertainmentConfig
} = require("../src/entertainment");
const {
  RANK_ENTERTAINMENT_LIMITS,
  dailyEntertainmentLimitMinutes,
  emptyEntertainmentLedger,
  entertainmentAccess,
  isWorkday,
  normalizeEntertainmentLedger
} = require("../src/entertainment-ledger");
const {
  PENAL_BATTALION_MS,
  RANKS,
  applyDistractionPenalty,
  applyForcedExitPenalty,
  awardDailyPlanItem,
  awardSession,
  calculateReward,
  entertainmentCost,
  rankForPoints,
  redeemEntertainment
} = require("../src/rewards");

test("daily plan resets when the local date changes", () => {
  const yesterday = new Date(2026, 5, 8, 12);
  const today = new Date(2026, 5, 9, 8);
  const saved = {
    ...emptyDailyPlan(yesterday),
    sourceTasks: "旧任务",
    items: [{ id: "old", title: "昨天的任务", completed: true }]
  };
  assert.deepEqual(normalizeDailyPlan(saved, today), emptyDailyPlan(today));
  assert.equal(localDateKey(today), "2026-06-09");
});

test("daily plan items are bounded and normalized", () => {
  const items = normalizePlanItems(Array.from({ length: 20 }, (_, index) => ({
    title: `任务 ${index + 1}`,
    details: "完成标准"
  })));
  assert.equal(items.length, 12);
  assert.equal(items[0].completed, false);
});

test("new daily goals append without replacing or duplicating existing items", () => {
  const existing = [{ id: "done", title: "提交报告", completed: true, completedAt: 123 }];
  const result = appendPlanItems(existing, [
    { id: "duplicate", title: "提交报告" },
    { id: "new", title: "联系客户" }
  ]);
  assert.equal(result.addedCount, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].completed, true);
  assert.equal(result.items[1].title, "联系客户");
});

test("daily plan evidence accepts bounded image data URLs", () => {
  assert.deepEqual(
    parseEvidenceImageDataUrl("data:image/jpeg;base64,SGVsbG8="),
    { mimeType: "image/jpeg", base64: "SGVsbG8=" }
  );
  assert.equal(parseEvidenceImageDataUrl("data:text/plain;base64,SGVsbG8="), null);
  assert.equal(parseEvidenceImageDataUrl("not-an-image"), null);
});

test("completing a daily plan item awards one point without adding a focus session", () => {
  const result = awardDailyPlanItem({ points: 4, completedSessions: 2 });
  assert.equal(result.points, 5);
  assert.equal(result.lastEarned, 1);
  assert.equal(result.completedSessions, 2);
});

test("blocked keywords take priority", () => {
  const result = classifyActivity(
    { processName: "chrome", title: "Bilibili - project tutorial" },
    { allowedKeywords: "project", blockedKeywords: "bilibili" }
  );
  assert.equal(result.verdict, "distracted");
});

test("allowed keywords mark focused activity", () => {
  const result = classifyActivity(
    { processName: "Code", title: "AI Friend - Visual Studio Code" },
    { allowedKeywords: "code, ai friend", blockedKeywords: "steam" }
  );
  assert.equal(result.verdict, "focused");
});

test("games installed through Steam are detected by executable path", () => {
  const result = classifyActivity(
    {
      processName: "eldenring",
      title: "ELDEN RING",
      executablePath: "D:\\Program Files\\Steam\\steamapps\\common\\ELDEN RING\\Game\\eldenring.exe"
    },
    { allowedKeywords: "", blockedKeywords: "", autoDetectGames: true }
  );
  assert.equal(result.verdict, "distracted");
  assert.match(result.reason, /自动识别游戏/);
});

test("game launchers are detected without manually adding keywords", () => {
  const result = classifyActivity(
    { processName: "EpicGamesLauncher", title: "Epic Games Launcher", executablePath: "" },
    { allowedKeywords: "", blockedKeywords: "", autoDetectGames: true }
  );
  assert.equal(result.verdict, "distracted");
});

test("games registered by Windows are detected outside known platform folders", () => {
  const executablePath = "D:\\Indie\\OddGame\\odd.exe";
  const result = classifyActivity(
    { processName: "odd", title: "Odd Game", executablePath },
    {
      allowedKeywords: "",
      blockedKeywords: "",
      autoDetectGames: true,
      registeredGameExecutables: [executablePath]
    }
  );
  assert.equal(result.verdict, "distracted");
  assert.match(result.reason, /Windows 已登记/);
});

test("an allowed keyword can explicitly exempt a game for development work", () => {
  const result = classifyActivity(
    {
      processName: "MyGame",
      title: "MyGame debug build",
      executablePath: "D:\\SteamLibrary\\steamapps\\common\\MyGame\\MyGame.exe"
    },
    { allowedKeywords: "mygame debug", blockedKeywords: "", autoDetectGames: true }
  );
  assert.equal(result.verdict, "focused");
});

test("interventions escalate gradually", () => {
  assert.equal(nextIntervention(0), "none");
  assert.equal(nextIntervention(1), "nudge");
  assert.equal(nextIntervention(3), "checkin");
  assert.equal(nextIntervention(6), "block");
});

test("distraction warning penalizes only on the second distracted verdict", () => {
  const first = advanceDistractionWarning({}, "distracted");
  assert.equal(first.warningCount, 1);
  assert.equal(first.warned, true);
  assert.equal(first.penalize, false);

  const second = advanceDistractionWarning(first, "distracted");
  assert.equal(second.warningCount, 0);
  assert.equal(second.warned, false);
  assert.equal(second.penalize, true);
});

test("five focused verdicts clear a pending distraction warning", () => {
  let warning = advanceDistractionWarning({}, "distracted");
  for (let index = 0; index < 4; index += 1) {
    warning = advanceDistractionWarning(warning, "focused");
    assert.equal(warning.warningCount, 1);
    assert.equal(warning.clearedByFocus, false);
  }

  warning = advanceDistractionWarning(warning, "focused");
  assert.equal(warning.warningCount, 0);
  assert.equal(warning.focusedCount, 0);
  assert.equal(warning.clearedByFocus, true);
});

test("unknown verdicts preserve a pending distraction warning", () => {
  const warning = advanceDistractionWarning({}, "distracted");
  const unknown = advanceDistractionWarning(warning, "unknown");
  assert.equal(unknown.warningCount, 1);
  assert.equal(unknown.focusedCount, 0);
  assert.equal(unknown.penalize, false);
});

test("AI classifier parses strict verdict JSON", () => {
  assert.deepEqual(
    parseAiVerdict('{"verdict":"distracted","reason":"娱乐网站"}', "文字 AI"),
    { verdict: "distracted", reason: "文字 AI：娱乐网站" }
  );
  assert.equal(parseAiVerdict('{"verdict":"maybe","reason":"不确定"}'), null);
});

test("activity cache key includes process path and title", () => {
  assert.equal(
    activityCacheKey({ processName: "Chrome", executablePath: "C:\\Chrome.exe", title: "Docs" }),
    "chrome|c:\\chrome.exe|docs"
  );
});

test("progress commentary is normalized and bounded", () => {
  assert.equal(sanitizeCommentary("“ 这份代码终于开始像一支队伍了。 ”"), "这份代码终于开始像一支队伍了。");
  assert.equal(sanitizeCommentary("a".repeat(200)).length, 120);
});

test("Cold Turkey password is CLI-safe and block names are validated", () => {
  const password = generateColdTurkeyPassword();
  assert.match(password, /^[A-Za-z0-9_-]{20,}$/);
  assert.equal(validateBlockName("AI Commissar"), "AI Commissar");
  assert.throws(() => validateBlockName('bad"name'));
});

test("Cold Turkey safe release uses 30 minute timed locks", () => {
  assert.equal(SAFE_LOCK_MINUTES, 30);
  assert.deepEqual(safeTimedLockArgs("AI Commissar"), ["-start", "AI Commissar", "-lock", "30"]);
  assert.deepEqual(safeTimedLockArgs("AI Commissar", 999), ["-start", "AI Commissar", "-lock", "30"]);
});

test("completed sessions earn points by duration", () => {
  assert.equal(calculateReward(25), 5);
  assert.equal(calculateReward(9), 1);
  assert.equal(calculateReward(4), 0);
});

test("all Soviet ranks progress in the requested order", () => {
  assert.deepEqual(RANKS.map((rank) => rank.name), [
    "列兵", "上等兵", "下士", "中士", "上士", "大士",
    "少尉", "中尉", "上尉", "大尉", "少校", "中校",
    "上校", "少将", "中将", "上将", "大将", "元帅"
  ]);
  assert.equal(rankForPoints(0), "列兵");
  assert.equal(rankForPoints(1550), "元帅");
});

test("negative points have no lower bound and require recovery to zero", () => {
  const punished = applyDistractionPenalty({ points: 0 }, 1000);
  assert.equal(punished.points, -1);
  assert.equal(punished.rank, "惩戒营");
  const deeper = applyForcedExitPenalty(punished, 2000);
  assert.equal(deeper.points, -4);
  assert.equal(deeper.rank, "惩戒营");
  const stillPunished = awardSession(deeper, 15, 3000);
  assert.equal(stillPunished.points, -1);
  assert.equal(stillPunished.rank, "惩戒营");
  const recovered = awardSession(stillPunished, 5, 4000);
  assert.equal(recovered.points, 0);
  assert.equal(recovered.rank, "列兵");
});

test("Cold Turkey CLI block status is parsed conservatively", () => {
  assert.equal(parseBlockStatus("\r\nEnabled\r\n"), "enabled");
  assert.equal(parseBlockStatus("\r\nDisabled\r\n"), "disabled");
  assert.equal(parseBlockStatus(""), "unknown");
  assert.equal(parseBlockStatus("request failed"), "unknown");
});

test("five deductions within one hour trigger a 24 hour penal battalion", () => {
  let profile = { points: 100 };
  for (let index = 0; index < 5; index += 1) {
    profile = applyDistractionPenalty(profile, 1000 + index * 1000);
  }
  assert.equal(profile.rank, "惩戒营");
  assert.equal(profile.punishmentUntil, 5000 + PENAL_BATTALION_MS);
  const stillPunished = awardSession(profile, 25, 6000);
  assert.equal(stillPunished.rank, "惩戒营");
});

test("forced exit deducts three points", () => {
  const result = applyForcedExitPenalty({ points: 20 }, 1000);
  assert.equal(result.points, 17);
  assert.equal(result.lastDeducted, 1);
});

test("Ollama model matching accepts explicit and latest tags", () => {
  const status = {
    models: [
      { name: "qwen3:8b" },
      { name: "qwen3-vl:8b" },
      { name: "custom:latest" }
    ]
  };
  assert.equal(hasModel(status, "qwen3:8b"), true);
  assert.equal(hasModel(status, "custom"), true);
  assert.equal(hasModel(status, "missing:8b"), false);
});

test("entertainment mode defaults to observing once per minute", () => {
  assert.equal(DEFAULT_ENTERTAINMENT_INTERVAL_SECONDS, 60);
});

test("OpenAI-compatible endpoints and chat responses are normalized", () => {
  assert.equal(normalizeApiBaseUrl("https://example.com/v1/"), "https://example.com/v1");
  assert.equal(normalizeApiBaseUrl("file:///tmp/api"), "https://api.openai.com/v1");
  assert.equal(
    compatibleEndpoint("https://example.com/v1/", "/chat/completions"),
    "https://example.com/v1/chat/completions"
  );
  assert.equal(extractChatCompletionText({
    choices: [{ message: { content: "兼容响应" } }]
  }), "兼容响应");
  assert.equal(extractChatCompletionText({
    choices: [{ text: "旧式兼容响应" }]
  }), "旧式兼容响应");
  assert.equal(extractChatCompletionText({
    output: { text: "输出字段响应" }
  }), "输出字段响应");
  assert.equal(extractChatCompletionText({
    choices: [{ message: { content: "", reasoning_content: "推理字段响应" } }]
  }), "推理字段响应");
  assert.equal(extractChatCompletionText({
    choices: [{ message: { content: [{ text: "数组" }, { output_text: "响应" }] } }]
  }), "数组响应");
  assert.match(summarizeCompatibleResponse({ value: "x".repeat(400) }), /xxx/);
  assert.deepEqual(completionTokenBody(900), { max_completion_tokens: 900 });
  assert.equal(isQwenCompatibleRequest("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen3.7-plus"), true);
  assert.equal(isQwenCompatibleRequest("https://api.openai.com/v1", "gpt-4o-mini"), false);
  assert.deepEqual(qwenThinkingBody("https://dashscope.aliyuncs.com/api/v1", "qwen3.7-plus"), {
    extra_body: { enable_thinking: false }
  });
  assert.deepEqual(qwenThinkingBody("https://api.openai.com/v1", "gpt-4o-mini"), {});
  assert.equal(alternateTokenParameter(
    "Unsupported parameter: 'max_completion_tokens'. Use 'max_tokens' instead.",
    "max_completion_tokens"
  ), "max_tokens");
  assert.equal(alternateTokenParameter(
    "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead.",
    "max_tokens"
  ), "max_completion_tokens");
});

test("JSON objects are extracted from chatty model responses", () => {
  const text = '好的，结果如下：{"accepted":false,"reason":"证据里有 { 花括号 } 但不足"}\n请继续补充。';
  assert.equal(
    extractFirstJsonObject(text),
    '{"accepted":false,"reason":"证据里有 { 花括号 } 但不足"}'
  );
  assert.deepEqual(parseJsonObjectFromText(text), {
    accepted: false,
    reason: "证据里有 { 花括号 } 但不足"
  });
});

test("Chinese blocked keywords match common English process names", () => {
  const result = classifyActivity(
    { processName: "WeChat", title: "聊天" },
    { allowedKeywords: "", blockedKeywords: "微信", autoDetectGames: false }
  );
  assert.equal(result.verdict, "distracted");
  assert.match(result.reason, /微信/);
});

test("password vault keeps only the five newest entries", () => {
  let entries = [];
  for (let index = 1; index <= 7; index += 1) {
    entries = rotatePasswordVaultEntries(entries, {
      createdAt: index,
      encryptedPassword: `secret-${index}`
    });
  }
  assert.equal(MAX_PASSWORD_VAULT_ENTRIES, 5);
  assert.deepEqual(entries.map((entry) => entry.createdAt), [3, 4, 5, 6, 7]);
});

test("saved preferences are normalized for restart restoration", () => {
  const preferences = normalizePreferences({
    task: "  写完报告  ",
    durationMinutes: 999,
    blockedKeywords: "微信, steam",
    autoDetectGames: false,
    visionQuality: "standard",
    ttsSpeed: 3,
    entertainmentIntervalSeconds: 5,
    dailyPlanReminderEnabled: true,
    dailyPlanReminderTime: "08:30",
    apiProviderName: "  OpenRouter  ",
    textApiBaseUrl: "https://text.example/api/v1/",
    visionApiBaseUrl: "https://vision.example/api/v1/",
    ttsApiBaseUrl: "https://tts.example/api/v1/",
    ttsProvider: "qwen",
    textModel: " text-only ",
    visionModel: " vision-only ",
    ttsModel: " custom-tts ",
    ttsVoice: " qwen-tts-vd-custom ",
    coldTurkeyBlockName: "  Focus Block  ",
    coldTurkeyPenaltyBlockName: "  Punishment Block  "
  });
  assert.equal(preferences.task, "写完报告");
  assert.equal(preferences.durationMinutes, 240);
  assert.equal(preferences.blockedKeywords, "微信, steam");
  assert.equal(preferences.autoDetectGames, false);
  assert.equal(preferences.visionQuality, "standard");
  assert.equal(preferences.ttsSpeed, 1.5);
  assert.equal(preferences.entertainmentIntervalSeconds, 15);
  assert.equal(preferences.dailyPlanReminderEnabled, true);
  assert.equal(preferences.dailyPlanReminderTime, "08:30");
  assert.equal(preferences.apiProviderName, "OpenRouter");
  assert.equal(preferences.apiBaseUrl, "https://text.example/api/v1");
  assert.equal(preferences.textApiBaseUrl, "https://text.example/api/v1");
  assert.equal(preferences.visionApiBaseUrl, "https://vision.example/api/v1");
  assert.equal(preferences.ttsApiBaseUrl, "https://tts.example/api/v1");
  assert.equal(preferences.ttsProvider, "qwen");
  assert.equal(preferences.textModel, "text-only");
  assert.equal(preferences.visionModel, "vision-only");
  assert.equal(preferences.aiModel, "text-only");
  assert.equal(preferences.ttsModel, "custom-tts");
  assert.equal(preferences.ttsVoice, "qwen-tts-vd-custom");
  assert.equal(preferences.coldTurkeyBlockName, "Focus Block");
  assert.equal(preferences.coldTurkeyPenaltyBlockName, "Punishment Block");
  assert.equal(normalizePreferences({ dailyPlanReminderTime: "29:90" }).dailyPlanReminderTime, "09:00");
  assert.equal(normalizePreferences({ coldTurkeyPenaltyBlockName: "   " }).coldTurkeyPenaltyBlockName, "Games");
  assert.equal(normalizePreferences({ aiModel: "legacy-model" }).visionModel, "legacy-model");
  assert.equal(normalizePreferences({ ttsModel: "   " }).ttsModel, "");
  assert.equal(normalizePreferences().ttsModel, "gpt-4o-mini-tts");
  assert.equal(normalizePreferences({ ttsProvider: "unexpected" }).ttsProvider, "openai");
  assert.equal(normalizePreferences({ apiBaseUrl: "https://legacy.example/v1/" }).textApiBaseUrl, "https://legacy.example/v1");
  assert.equal(normalizePreferences({ apiBaseUrl: "https://legacy.example/v1/" }).visionApiBaseUrl, "https://legacy.example/v1");
  assert.equal(normalizePreferences({ apiBaseUrl: "https://legacy.example/v1/" }).ttsApiBaseUrl, "https://legacy.example/v1");
});

test("entertainment time costs one point per five minutes without punishment", () => {
  assert.equal(entertainmentCost(30), 6);
  const result = redeemEntertainment({ points: 10 }, 30, 1000);
  assert.equal(result.points, 4);
  assert.equal(result.rank, "列兵");
  assert.equal(result.lastDeducted, 0);
  assert.throws(() => redeemEntertainment({ points: 2 }, 30), /积分不足/);
});

test("workday entertainment requires three focused hours and follows rank limits", () => {
  const monday = new Date(2026, 5, 15, 12);
  assert.equal(isWorkday(monday), true);
  assert.equal(dailyEntertainmentLimitMinutes("列兵"), 60);
  assert.equal(dailyEntertainmentLimitMinutes("大士"), 85);
  assert.equal(dailyEntertainmentLimitMinutes("少尉"), 100);
  assert.equal(dailyEntertainmentLimitMinutes("少校"), 130);
  assert.equal(dailyEntertainmentLimitMinutes("少将"), 155);
  assert.equal(dailyEntertainmentLimitMinutes("元帅"), 180);
  assert.equal(dailyEntertainmentLimitMinutes("惩戒营"), 0);
  const access = entertainmentAccess(
    { rank: "少尉" },
    { focusedMinutes: 179, redeemedMinutes: 30 },
    monday
  );
  assert.equal(access.focusRequirementMet, false);
  assert.equal(access.remainingMinutes, 70);
});

test("entertainment limits rise at every rank with milestone boosts", () => {
  const limits = RANKS.map((rank) => RANK_ENTERTAINMENT_LIMITS[rank.name]);
  assert.equal(limits.every((limit, index) => index === 0 || limit > limits[index - 1]), true);
  assert.equal(RANK_ENTERTAINMENT_LIMITS.少尉 - RANK_ENTERTAINMENT_LIMITS.大士, 15);
  assert.equal(RANK_ENTERTAINMENT_LIMITS.少校 - RANK_ENTERTAINMENT_LIMITS.大尉, 15);
  assert.equal(RANK_ENTERTAINMENT_LIMITS.少将 - RANK_ENTERTAINMENT_LIMITS.上校, 15);
  assert.equal(RANK_ENTERTAINMENT_LIMITS.元帅, 180);
});

test("weekend entertainment has no time cap but still exposes the point ratio", () => {
  const sunday = new Date(2026, 5, 14, 12);
  const access = entertainmentAccess(
    { rank: "列兵" },
    { focusedMinutes: 0, redeemedMinutes: 600 },
    sunday
  );
  assert.equal(access.workday, false);
  assert.equal(access.focusRequirementMet, true);
  assert.equal(access.dailyLimitMinutes, null);
  assert.equal(access.remainingMinutes, null);
  assert.equal(access.pointMinutes, 5);
});

test("daily entertainment ledger resets across local dates", () => {
  const yesterday = new Date(2026, 5, 13, 12);
  const today = new Date(2026, 5, 14, 12);
  assert.deepEqual(normalizeEntertainmentLedger({
    date: localDateKey(yesterday),
    focusedMinutes: 180,
    redeemedMinutes: 60
  }, today), emptyEntertainmentLedger(today));
});

test("entertainment commentary explicitly avoids focus supervision", () => {
  const prompt = buildEntertainmentPrompt("保持克制。", {
    processName: "game",
    title: "A spoiler-sensitive game"
  }, [{
    processName: "game",
    title: "Earlier scene",
    commentary: "看来你正在探索地图。"
  }]);
  assert.match(prompt, /不要督促其工作/);
  assert.match(prompt, /不得.*剧透/);
  assert.match(prompt, /game/);
  assert.match(prompt, /探索地图/);
  assert.match(prompt, /具体可执行的战术建议/);
  assert.match(prompt, /走位.*技能时机.*配装/);
  assert.match(prompt, /不要编造游戏机制/);
});

test("entertainment model settings are normalized independently", () => {
  assert.deepEqual(normalizeEntertainmentConfig({
    commentaryEnabled: false,
    ollamaEnabled: 1,
    ollamaVisionModel: "  qwen3-vl:8b  ",
    ollamaFallbackToOpenAi: false,
    textModel: " custom-text ",
    visionModel: " custom-vision ",
    ttsModel: "",
    ttsProvider: "qwen",
    ttsApiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    visionQuality: "standard",
    ttsVoice: "qwen-tts-vd-custom",
    ttsSpeed: 1.25,
    intervalSeconds: 5
  }), {
    commentaryEnabled: false,
    ollamaEnabled: true,
    ollamaVisionModel: "qwen3-vl:8b",
    ollamaFallbackToOpenAi: false,
    textModel: "custom-text",
    visionModel: "custom-vision",
    aiModel: "custom-text",
    ttsModel: "",
    ttsProvider: "qwen",
    ttsApiBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    visionQuality: "standard",
    ttsVoice: "qwen-tts-vd-custom",
    ttsSpeed: 1.25,
    intervalSeconds: 15
  });
  assert.equal(normalizeEntertainmentConfig({ ttsVoice: "qwen-custom" }).ttsVoice, "qwen-custom");
  assert.equal(normalizeTtsSpeed(0.1), 0.75);
  assert.equal(normalizeTtsSpeed(9), 1.5);
  assert.equal(normalizeTtsSpeed(""), 1.1);
  assert.equal(normalizeVisionQuality("standard"), "standard");
  assert.equal(normalizeVisionQuality("unexpected"), "high");
  assert.equal(normalizeEntertainmentConfig({ intervalSeconds: 9999 }).intervalSeconds, 600);
  assert.equal(MAX_ENTERTAINMENT_MEMORY_TURNS, 30);
});
