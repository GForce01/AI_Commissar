function parseAiVerdict(text, prefix = "AI") {
  const json = String(text || "").match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;

  try {
    const parsed = JSON.parse(json);
    if (!["focused", "distracted", "unknown"].includes(parsed.verdict)) return null;
    return {
      verdict: parsed.verdict,
      reason: `${prefix}：${String(parsed.reason || "无说明").slice(0, 60)}`
    };
  } catch {
    return null;
  }
}

function activityCacheKey(activity) {
  return [
    String(activity?.processName || "").toLowerCase(),
    String(activity?.executablePath || "").toLowerCase(),
    String(activity?.title || "").toLowerCase()
  ].join("|");
}

function sanitizeCommentary(text) {
  return String(text || "")
    .replace(/^["“]|["”]$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

module.exports = { activityCacheKey, parseAiVerdict, sanitizeCommentary };
