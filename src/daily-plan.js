const MAX_DAILY_PLAN_ITEMS = 12;
const MAX_EVIDENCE_IMAGE_BYTES = 5 * 1024 * 1024;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizePlanItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_DAILY_PLAN_ITEMS).map((item, index) => ({
    id: String(item.id || `plan-${index + 1}`),
    title: String(item.title || "").trim().slice(0, 120),
    details: String(item.details || "").trim().slice(0, 300),
    suggestedTime: String(item.suggestedTime || "").trim().slice(0, 40),
    completed: Boolean(item.completed),
    completedAt: Math.max(0, Number(item.completedAt || 0))
  })).filter((item) => item.title);
}

function appendPlanItems(existingItems = [], newItems = []) {
  const existing = normalizePlanItems(existingItems);
  const seen = new Set(existing.map((item) => item.title.trim().toLowerCase()));
  const additions = normalizePlanItems(newItems)
    .filter((item) => {
      const key = item.title.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(0, MAX_DAILY_PLAN_ITEMS - existing.length));
  return {
    items: [...existing, ...additions],
    addedCount: additions.length
  };
}

function emptyDailyPlan(date = new Date()) {
  return {
    date: localDateKey(date),
    sourceTasks: "",
    items: [],
    generatedAt: 0,
    status: "今天尚未生成计划"
  };
}

function normalizeDailyPlan(saved = {}, date = new Date()) {
  const today = localDateKey(date);
  if (saved.date !== today) return emptyDailyPlan(date);
  return {
    date: today,
    sourceTasks: String(saved.sourceTasks || "").trim().slice(0, 4000),
    items: normalizePlanItems(saved.items),
    generatedAt: Math.max(0, Number(saved.generatedAt || 0)),
    status: String(saved.status || "今日计划已就绪").slice(0, 160)
  };
}

function parseEvidenceImageDataUrl(value) {
  const match = String(value || "").match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/
  );
  if (!match) return null;
  const base64 = match[2];
  const approximateBytes = Math.floor(base64.length * 0.75);
  if (approximateBytes <= 0 || approximateBytes > MAX_EVIDENCE_IMAGE_BYTES) return null;
  return { mimeType: match[1], base64 };
}

module.exports = {
  MAX_EVIDENCE_IMAGE_BYTES,
  MAX_DAILY_PLAN_ITEMS,
  appendPlanItems,
  emptyDailyPlan,
  localDateKey,
  normalizeDailyPlan,
  normalizePlanItems,
  parseEvidenceImageDataUrl
};
