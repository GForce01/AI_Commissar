const DEFAULT_PREFERENCES = {
  task: "完成当前最重要的工作",
  durationMinutes: 25,
  aiModel: "gpt-5.4-mini",
  apiProviderName: "OpenAI",
  apiBaseUrl: "https://api.openai.com/v1",
  ttsModel: "gpt-4o-mini-tts",
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
    aiModel: String(saved.aiModel || DEFAULT_PREFERENCES.aiModel).trim(),
    apiProviderName: String(saved.apiProviderName || DEFAULT_PREFERENCES.apiProviderName).trim().slice(0, 60),
    apiBaseUrl: normalizeApiBaseUrl(saved.apiBaseUrl).slice(0, 500),
    ttsModel: String(saved.ttsModel || DEFAULT_PREFERENCES.ttsModel).trim().slice(0, 120),
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
    coldTurkeyBlockName: String(saved.coldTurkeyBlockName || DEFAULT_PREFERENCES.coldTurkeyBlockName).trim().slice(0, 80),
    ttsVoice: ["onyx", "echo", "ash"].includes(saved.ttsVoice) ? saved.ttsVoice : "onyx",
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
