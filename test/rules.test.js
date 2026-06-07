const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyActivity, nextIntervention } = require("../src/rules");
const { activityCacheKey, parseAiVerdict, sanitizeCommentary } = require("../src/ai-classifier");
const { generateColdTurkeyPassword, validateBlockName } = require("../src/cold-turkey");
const { hasModel } = require("../src/ollama");
const {
  PENAL_BATTALION_MS,
  RANKS,
  applyDistractionPenalty,
  applyForcedExitPenalty,
  awardSession,
  calculateReward,
  rankForPoints
} = require("../src/rewards");

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

test("completed sessions earn points by duration", () => {
  assert.equal(calculateReward(25, 0), 5);
  assert.equal(calculateReward(5, 99), 1);
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

test("a private at minus one enters the penal battalion until recovery", () => {
  const punished = applyDistractionPenalty({ points: 0 }, 1000);
  assert.equal(punished.points, -1);
  assert.equal(punished.rank, "惩戒营");
  const recovered = awardSession(punished, 5, 2000);
  assert.equal(recovered.points, 0);
  assert.equal(recovered.rank, "列兵");
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
