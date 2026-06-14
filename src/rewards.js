const RANKS = [
  { name: "列兵", points: 0 },
  { name: "上等兵", points: 10 },
  { name: "下士", points: 25 },
  { name: "中士", points: 45 },
  { name: "上士", points: 70 },
  { name: "大士", points: 100 },
  { name: "少尉", points: 140 },
  { name: "中尉", points: 190 },
  { name: "上尉", points: 250 },
  { name: "大尉", points: 320 },
  { name: "少校", points: 400 },
  { name: "中校", points: 500 },
  { name: "上校", points: 620 },
  { name: "少将", points: 760 },
  { name: "中将", points: 920 },
  { name: "上将", points: 1100 },
  { name: "大将", points: 1300 },
  { name: "元帅", points: 1550 }
];

const RAPID_PENALTY_WINDOW_MS = 60 * 60 * 1000;
const RAPID_PENALTY_COUNT = 5;
const PENAL_BATTALION_MS = 24 * 60 * 60 * 1000;

function calculateReward(durationMinutes) {
  return Math.max(0, Math.floor(Number(durationMinutes || 0) / 5));
}

function rankForPoints(points) {
  const total = Math.max(0, Number(points || 0));
  return [...RANKS].reverse().find((rank) => total >= rank.points)?.name || "列兵";
}

function normalizeRewards(saved = {}, now = Date.now()) {
  const points = Number(saved.points || 0);
  const punishmentUntil = Math.max(0, Number(saved.punishmentUntil || 0));
  const deductionEvents = Array.isArray(saved.deductionEvents)
    ? saved.deductionEvents.map(Number).filter((time) => Number.isFinite(time) && now - time <= RAPID_PENALTY_WINDOW_MS)
    : [];

  return {
    points,
    completedSessions: Math.max(0, Number(saved.completedSessions || 0)),
    rank: displayRank(points, punishmentUntil, now),
    lastEarned: Math.max(0, Number(saved.lastEarned || 0)),
    lastDeducted: Math.max(0, Number(saved.lastDeducted || 0)),
    deductionEvents,
    punishmentUntil,
    punishmentReason: String(saved.punishmentReason || "")
  };
}

function displayRank(points, punishmentUntil = 0, now = Date.now()) {
  if (Number(points) < 0 || Number(punishmentUntil) > now) return "惩戒营";
  return rankForPoints(points);
}

function applyDistractionPenalty(profile, now = Date.now()) {
  const current = normalizeRewards(profile, now);
  const rankBeforePenalty = rankForPoints(current.points);
  const points = current.points - 1;
  const deductionEvents = [...current.deductionEvents, now]
    .filter((time) => now - time <= RAPID_PENALTY_WINDOW_MS);

  let punishmentUntil = current.punishmentUntil;
  let punishmentReason = current.punishmentReason;
  if (rankBeforePenalty === "列兵" && points < 0) {
    punishmentReason = "列兵积分降至 -1";
  } else if (rankBeforePenalty !== "列兵" && deductionEvents.length >= RAPID_PENALTY_COUNT) {
    punishmentUntil = Math.max(punishmentUntil, now + PENAL_BATTALION_MS);
    punishmentReason = "60 分钟内累计扣分 5 次";
  }

  return normalizeRewards({
    ...current,
    points,
    lastDeducted: 1,
    deductionEvents,
    punishmentUntil,
    punishmentReason
  }, now);
}

function applyForcedExitPenalty(profile, now = Date.now(), amount = 3) {
  let current = normalizeRewards(profile, now);
  for (let index = 0; index < amount; index += 1) {
    current = applyDistractionPenalty(current, now + index);
  }
  return current;
}

function awardSession(profile, durationMinutes, now = Date.now()) {
  const current = normalizeRewards(profile, now);
  const earned = calculateReward(durationMinutes);
  const points = current.points + earned;
  const recoveredFromPrivatePenalty = current.points < 0 && points >= 0 && current.punishmentUntil <= now;

  return normalizeRewards({
    ...current,
    points,
    completedSessions: current.completedSessions + 1,
    lastEarned: earned,
    lastDeducted: 0,
    punishmentReason: recoveredFromPrivatePenalty ? "" : current.punishmentReason
  }, now);
}

function awardDailyPlanItem(profile, now = Date.now()) {
  const current = normalizeRewards(profile, now);
  const points = current.points + 1;
  const recoveredFromPrivatePenalty = current.points < 0 && points >= 0 && current.punishmentUntil <= now;
  return normalizeRewards({
    ...current,
    points,
    lastEarned: 1,
    lastDeducted: 0,
    punishmentReason: recoveredFromPrivatePenalty ? "" : current.punishmentReason
  }, now);
}

function entertainmentCost(durationMinutes) {
  const minutes = Math.max(5, Math.min(240, Number(durationMinutes) || 5));
  return Math.ceil(minutes / 5);
}

function redeemEntertainment(profile, durationMinutes, now = Date.now()) {
  const current = normalizeRewards(profile, now);
  const cost = entertainmentCost(durationMinutes);
  if (current.points < cost) {
    throw new Error(`积分不足：需要 ${cost} 点，当前 ${current.points} 点`);
  }
  return normalizeRewards({
    ...current,
    points: current.points - cost,
    lastEarned: 0,
    lastDeducted: 0
  }, now);
}

module.exports = {
  PENAL_BATTALION_MS,
  RAPID_PENALTY_COUNT,
  RAPID_PENALTY_WINDOW_MS,
  RANKS,
  applyDistractionPenalty,
  applyForcedExitPenalty,
  awardDailyPlanItem,
  awardSession,
  calculateReward,
  displayRank,
  entertainmentCost,
  normalizeRewards,
  rankForPoints,
  redeemEntertainment
};
