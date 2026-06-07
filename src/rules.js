const { detectGame } = require("./game-detector");

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  }

  return String(value || "")
    .split(/[\n,，]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function classifyActivity(activity, config) {
  const title = String(activity?.title || "").toLowerCase();
  const processName = String(activity?.processName || "").toLowerCase();
  const haystack = `${processName} ${title}`;
  const blocked = normalizeList(config.blockedKeywords);
  const allowed = normalizeList(config.allowedKeywords);

  const blockedMatch = blocked.find((keyword) => haystack.includes(keyword));
  if (blockedMatch) {
    return { verdict: "distracted", reason: `命中分心词：${blockedMatch}` };
  }

  const allowedMatch = allowed.find((keyword) => haystack.includes(keyword));
  if (allowedMatch) {
    return { verdict: "focused", reason: `命中专注词：${allowedMatch}` };
  }

  if (config.autoDetectGames !== false) {
    const game = detectGame(
      activity,
      config.installedGameRoots || [],
      config.registeredGameExecutables || []
    );
    if (game.detected) {
      return { verdict: "distracted", reason: `自动识别游戏：${game.reason}` };
    }
  }

  if (!title && !processName) {
    return { verdict: "unknown", reason: "无法读取当前窗口" };
  }

  return { verdict: "unknown", reason: "规则无法确定" };
}

function nextIntervention(consecutiveDistracted) {
  if (consecutiveDistracted >= 6) return "block";
  if (consecutiveDistracted >= 3) return "checkin";
  if (consecutiveDistracted >= 1) return "nudge";
  return "none";
}

module.exports = { classifyActivity, nextIntervention, normalizeList };
