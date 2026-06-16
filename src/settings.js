const DEFAULT_PREFERENCES = {
  task: "完成当前最重要的工作",
  durationMinutes: 25,
  textModel: "gpt-5.4-mini",
  visionModel: "gpt-5.4-mini",
  apiProviderName: "OpenAI",
  apiBaseUrl: "https://api.openai.com/v1",
  textApiBaseUrl: "https://api.openai.com/v1",
  visionApiBaseUrl: "https://api.openai.com/v1",
  ttsApiBaseUrl: "https://api.openai.com/v1",
  ttsProvider: "openai",
  ttsModel: "",
  allowedKeywords: "",
  blockedKeywords: "",
  autoDetectGames: true,
  aiEnabled: true,
  visionQuality: "high",
  ollamaEnabled: false,
  ollamaTextModel: "qwen3:8b",
  ollamaVisionModel: "qwen3-vl:8b",
  ollamaFallbackToOpenAi: true,
  voiceEnabled: true,
  commentaryEnabled: true,
  commentaryIntervalMinutes: 10,
  coldTurkeyEnabled: false,
  coldTurkeyBlockName: "AI Commissar",
  coldTurkeyPenaltyBlockName: "Games",
  ttsVoice: "onyx",
  ttsSpeed: 1.1,
  entertainmentCommentaryEnabled: true,
  entertainmentIntervalSeconds: 60,
  entertainmentDurationMinutes: 30,
  dailyPlanReminderEnabled: false,
  dailyPlanReminderTime: "09:00"
};

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeBlockName(value, fallback) {
  const name = String(value || "").trim().slice(0, 80);
  return name || fallback;
}

function normalizePreferences(saved = {}) {
  const reminderMatch = String(saved.dailyPlanReminderTime || "").match(/^(\d{2}):(\d{2})$/);
  const reminderTime = reminderMatch
    && Number(reminderMatch[1]) <= 23
    && Number(reminderMatch[2]) <= 59
    ? reminderMatch[0]
    : DEFAULT_PREFERENCES.dailyPlanReminderTime;
  return {
    task: String(saved.task || DEFAULT_PREFERENCES.task).trim().slice(0, 120),
    durationMinutes: clampNumber(saved.durationMinutes, 5, 240, 25),
    textModel: String(
      saved.textModel || saved.aiModel || DEFAULT_PREFERENCES.textModel
    ).trim().slice(0, 120),
    visionModel: String(
      saved.visionModel || saved.aiModel || DEFAULT_PREFERENCES.visionModel
    ).trim().slice(0, 120),
    aiModel: String(
      saved.textModel || saved.aiModel || DEFAULT_PREFERENCES.textModel
    ).trim().slice(0, 120),
    apiProviderName: String(saved.apiProviderName || DEFAULT_PREFERENCES.apiProviderName).trim().slice(0, 60),
    apiBaseUrl: normalizeApiBaseUrl(saved.textApiBaseUrl || saved.apiBaseUrl).slice(0, 500),
    textApiBaseUrl: normalizeApiBaseUrl(saved.textApiBaseUrl || saved.apiBaseUrl).slice(0, 500),
    visionApiBaseUrl: normalizeApiBaseUrl(
      saved.visionApiBaseUrl || saved.apiBaseUrl || saved.textApiBaseUrl
    ).slice(0, 500),
    ttsApiBaseUrl: normalizeApiBaseUrl(saved.ttsApiBaseUrl || saved.apiBaseUrl || saved.textApiBaseUrl).slice(0, 500),
    ttsProvider: saved.ttsProvider === "qwen" ? "qwen" : "openai",
    ttsModel: String(saved.ttsModel || "").trim().slice(0, 120),
    allowedKeywords: String(saved.allowedKeywords || ""),
    blockedKeywords: String(saved.blockedKeywords || ""),
    autoDetectGames: saved.autoDetectGames !== false,
    aiEnabled: saved.aiEnabled !== false,
    visionQuality: saved.visionQuality === "standard" ? "standard" : "high",
    ollamaEnabled: Boolean(saved.ollamaEnabled),
    ollamaTextModel: String(saved.ollamaTextModel || DEFAULT_PREFERENCES.ollamaTextModel).trim(),
    ollamaVisionModel: String(saved.ollamaVisionModel || DEFAULT_PREFERENCES.ollamaVisionModel).trim(),
    ollamaFallbackToOpenAi: saved.ollamaFallbackToOpenAi !== false,
    voiceEnabled: saved.voiceEnabled !== false,
    commentaryEnabled: saved.commentaryEnabled !== false,
    commentaryIntervalMinutes: clampNumber(saved.commentaryIntervalMinutes, 3, 60, 10),
    coldTurkeyEnabled: Boolean(saved.coldTurkeyEnabled),
    coldTurkeyBlockName: normalizeBlockName(
      saved.coldTurkeyBlockName,
      DEFAULT_PREFERENCES.coldTurkeyBlockName
    ),
    coldTurkeyPenaltyBlockName: normalizeBlockName(
      saved.coldTurkeyPenaltyBlockName,
      DEFAULT_PREFERENCES.coldTurkeyPenaltyBlockName
    ),
    ttsVoice: String(saved.ttsVoice || DEFAULT_PREFERENCES.ttsVoice).trim().slice(0, 180)
      || DEFAULT_PREFERENCES.ttsVoice,
    ttsSpeed: clampNumber(saved.ttsSpeed, 0.75, 1.5, 1.1),
    entertainmentCommentaryEnabled: saved.entertainmentCommentaryEnabled !== false,
    entertainmentIntervalSeconds: clampNumber(saved.entertainmentIntervalSeconds, 15, 600, 60),
    entertainmentDurationMinutes: clampNumber(saved.entertainmentDurationMinutes, 5, 240, 30),
    dailyPlanReminderEnabled: Boolean(saved.dailyPlanReminderEnabled),
    dailyPlanReminderTime: reminderTime
  };
}

module.exports = { DEFAULT_PREFERENCES, normalizePreferences };
const { normalizeApiBaseUrl } = require("./openai-compatible");
