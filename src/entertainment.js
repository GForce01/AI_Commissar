const DEFAULT_ENTERTAINMENT_INTERVAL_SECONDS = 60;
const MIN_ENTERTAINMENT_INTERVAL_SECONDS = 15;
const MAX_ENTERTAINMENT_INTERVAL_SECONDS = 600;
const MAX_ENTERTAINMENT_MEMORY_TURNS = 30;
const DEFAULT_TTS_SPEED = 1.1;
const MIN_TTS_SPEED = 0.75;
const MAX_TTS_SPEED = 1.5;

function normalizeTtsSpeed(value) {
  return Math.max(MIN_TTS_SPEED, Math.min(MAX_TTS_SPEED, Number(value) || DEFAULT_TTS_SPEED));
}

function normalizeVisionQuality(value) {
  return value === "standard" ? "standard" : "high";
}

function normalizeEntertainmentConfig(config = {}) {
  return {
    commentaryEnabled: config.commentaryEnabled !== false,
    ollamaEnabled: Boolean(config.ollamaEnabled),
    ollamaVisionModel: String(config.ollamaVisionModel || "qwen3-vl:8b").trim(),
    ollamaFallbackToOpenAi: config.ollamaFallbackToOpenAi !== false,
    aiModel: String(config.aiModel || "gpt-5.4-mini").trim(),
    visionQuality: normalizeVisionQuality(config.visionQuality),
    ttsVoice: ["onyx", "echo", "ash"].includes(config.ttsVoice) ? config.ttsVoice : "onyx",
    ttsSpeed: normalizeTtsSpeed(config.ttsSpeed),
    intervalSeconds: Math.max(
      MIN_ENTERTAINMENT_INTERVAL_SECONDS,
      Math.min(
        MAX_ENTERTAINMENT_INTERVAL_SECONDS,
        Number(config.intervalSeconds) || DEFAULT_ENTERTAINMENT_INTERVAL_SECONDS
      )
    )
  };
}

function buildEntertainmentPrompt(personalityPrompt, activity = {}, memory = []) {
  const recentContext = memory.slice(-MAX_ENTERTAINMENT_MEMORY_TURNS).map((turn, index) => [
    `${index + 1}. 前台进程：${turn.processName || "未知"}`,
    `窗口标题：${turn.title || "未知"}`,
    `你的点评：${turn.commentary || "无"}`
  ].join("；")).join("\n");

  return [
    personalityPrompt,
    `前台进程：${activity.processName || "未知"}`,
    `窗口标题：${activity.title || "未知"}`,
    "现在是用户主动开启的娱乐时间，不要督促其工作，也不要判断是否分心。",
    "观察截图，像一位投入、直率而有趣的同伴一样回应当前娱乐内容，可以比专注模式更大胆、更有主见。",
    recentContext ? `本次临时会话的最近互动：\n${recentContext}` : "这是本次临时会话的第一次观察。",
    "延续之前的语气和话题，注意画面变化，不要机械重复。",
    "如果能较有把握地认出游戏、模式、角色或当前局势，优先结合画面给出具体可执行的战术建议，例如走位、目标优先级、技能时机、配装、资源管理或团队协作。",
    "可以直接指出失误、风险和更优打法，但语气应像并肩观战的队友，不要居高临下。",
    "如果无法可靠识别游戏或局势，就评论能确认的画面信息，不要编造游戏机制、角色名称或战术。",
    "只依据当前画面和上述会话记忆回应，不要假装记得其他会话。",
    "可以幽默、兴奋或简短吐槽，但不得羞辱、说教、剧透或制造焦虑。",
    "不超过 90 个汉字，只输出评论正文。"
  ].join("\n");
}

module.exports = {
  DEFAULT_ENTERTAINMENT_INTERVAL_SECONDS,
  MAX_ENTERTAINMENT_INTERVAL_SECONDS,
  MAX_ENTERTAINMENT_MEMORY_TURNS,
  MIN_ENTERTAINMENT_INTERVAL_SECONDS,
  buildEntertainmentPrompt,
  normalizeTtsSpeed,
  normalizeVisionQuality,
  normalizeEntertainmentConfig
};
