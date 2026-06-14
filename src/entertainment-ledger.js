const { localDateKey } = require("./daily-plan");

const WORKDAY_REQUIRED_FOCUS_MINUTES = 180;
const ENTERTAINMENT_POINT_MINUTES = 5;

const RANK_ENTERTAINMENT_LIMITS = {
  列兵: 60,
  上等兵: 65,
  下士: 70,
  中士: 75,
  上士: 80,
  大士: 85,
  少尉: 100,
  中尉: 105,
  上尉: 110,
  大尉: 115,
  少校: 130,
  中校: 135,
  上校: 140,
  少将: 155,
  中将: 160,
  上将: 165,
  大将: 170,
  元帅: 180
};

function emptyEntertainmentLedger(date = new Date()) {
  return {
    date: localDateKey(date),
    focusedMinutes: 0,
    redeemedMinutes: 0
  };
}

function normalizeEntertainmentLedger(saved = {}, date = new Date()) {
  if (saved.date !== localDateKey(date)) return emptyEntertainmentLedger(date);
  return {
    date: localDateKey(date),
    focusedMinutes: Math.max(0, Number(saved.focusedMinutes || 0)),
    redeemedMinutes: Math.max(0, Number(saved.redeemedMinutes || 0))
  };
}

function isWorkday(date = new Date()) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function dailyEntertainmentLimitMinutes(rank) {
  if (rank === "惩戒营") return 0;
  return RANK_ENTERTAINMENT_LIMITS[rank] ?? RANK_ENTERTAINMENT_LIMITS.列兵;
}

function entertainmentAccess(profile, ledger, date = new Date()) {
  const workday = isWorkday(date);
  const rank = String(profile?.rank || "列兵");
  const dailyLimitMinutes = workday ? dailyEntertainmentLimitMinutes(rank) : null;
  const remainingMinutes = dailyLimitMinutes === null
    ? null
    : Math.max(0, dailyLimitMinutes - Number(ledger?.redeemedMinutes || 0));
  const focusedMinutes = Number(ledger?.focusedMinutes || 0);
  return {
    workday,
    rank,
    blockedByPenalty: rank === "惩戒营",
    requiredFocusMinutes: workday ? WORKDAY_REQUIRED_FOCUS_MINUTES : 0,
    focusedMinutes,
    focusRequirementMet: !workday || focusedMinutes >= WORKDAY_REQUIRED_FOCUS_MINUTES,
    dailyLimitMinutes,
    redeemedMinutes: Number(ledger?.redeemedMinutes || 0),
    remainingMinutes,
    pointMinutes: ENTERTAINMENT_POINT_MINUTES
  };
}

module.exports = {
  ENTERTAINMENT_POINT_MINUTES,
  RANK_ENTERTAINMENT_LIMITS,
  WORKDAY_REQUIRED_FOCUS_MINUTES,
  dailyEntertainmentLimitMinutes,
  emptyEntertainmentLedger,
  entertainmentAccess,
  isWorkday,
  normalizeEntertainmentLedger
};
