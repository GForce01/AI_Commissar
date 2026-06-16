const TTS_PRESETS = {
  openai: [
    { label: "Onyx", value: "onyx" },
    { label: "Echo", value: "echo" },
    { label: "Ash", value: "ash" }
  ],
  qwen: [
    { label: "青年政委1", value: "qwen-tts-vd-bailian-voice-20260616085444879-9660" },
    { label: "青年政委2", value: "qwen-tts-vd-bailian-voice-20260616104622215-236d" },
    { label: "中年政委", value: "qwen-tts-vd-bailian-voice-20260616104059145-6688" },
    { label: "老政委", value: "qwen-tts-vd-bailian-voice-20260616104302901-841f" }
  ]
};

const TTS_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini-tts",
    voice: "onyx"
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    model: "qwen3-tts-vd-2026-01-26",
    voice: "qwen-tts-vd-bailian-voice-20260616085444879-9660"
  }
};

function ttsPresetValues(provider) {
  return TTS_PRESETS[provider] || TTS_PRESETS.openai;
}

function currentTtsVoice() {
  return elements.ttsVoicePreset.value === "__custom__"
    ? elements.ttsVoice.value.trim()
    : elements.ttsVoicePreset.value;
}

function renderTtsVoicePresets(provider, voice) {
  const presets = ttsPresetValues(provider);
  elements.ttsVoicePreset.replaceChildren(...presets.map((preset) => {
    const option = document.createElement("option");
    option.value = preset.value;
    option.textContent = preset.label;
    return option;
  }));
  const custom = document.createElement("option");
  custom.value = "__custom__";
  custom.textContent = "自定义声音";
  elements.ttsVoicePreset.append(custom);

  const selectedVoice = String(voice || TTS_DEFAULTS[provider]?.voice || TTS_DEFAULTS.openai.voice).trim();
  const matched = presets.some((preset) => preset.value === selectedVoice);
  elements.ttsVoicePreset.value = matched ? selectedVoice : "__custom__";
  elements.ttsVoice.value = matched ? "" : selectedVoice;
  elements.ttsVoiceCustomLabel.classList.toggle("hidden", matched);
}

const elements = {
  form: document.querySelector("#sessionForm"),
  task: document.querySelector("#task"),
  duration: document.querySelector("#duration"),
  textModel: document.querySelector("#textModel"),
  visionModel: document.querySelector("#visionModel"),
  copyTextModelToVision: document.querySelector("#copyTextModelToVisionButton"),
  allowed: document.querySelector("#allowed"),
  blocked: document.querySelector("#blocked"),
  autoDetectGames: document.querySelector("#autoDetectGames"),
  aiEnabled: document.querySelector("#aiEnabled"),
  visionQuality: document.querySelector("#visionQuality"),
  apiProviderName: document.querySelector("#apiProviderName"),
  textApiBaseUrl: document.querySelector("#textApiBaseUrl"),
  visionApiBaseUrl: document.querySelector("#visionApiBaseUrl"),
  ttsProvider: document.querySelector("#ttsProvider"),
  ttsApiBaseUrl: document.querySelector("#ttsApiBaseUrl"),
  textCompatibleApiKey: document.querySelector("#textCompatibleApiKey"),
  visionCompatibleApiKey: document.querySelector("#visionCompatibleApiKey"),
  ttsCompatibleApiKey: document.querySelector("#ttsCompatibleApiKey"),
  copyTextKeyToVision: document.querySelector("#copyTextKeyToVisionButton"),
  copyTextKeyToTts: document.querySelector("#copyTextKeyToTtsButton"),
  ttsModel: document.querySelector("#ttsModel"),
  saveTextApiKey: document.querySelector("#saveTextApiKeyButton"),
  clearTextApiKey: document.querySelector("#clearTextApiKeyButton"),
  saveVisionApiKey: document.querySelector("#saveVisionApiKeyButton"),
  clearVisionApiKey: document.querySelector("#clearVisionApiKeyButton"),
  saveTtsApiKey: document.querySelector("#saveTtsApiKeyButton"),
  clearTtsApiKey: document.querySelector("#clearTtsApiKeyButton"),
  testTextModel: document.querySelector("#testTextModelButton"),
  testVisionModel: document.querySelector("#testVisionModelButton"),
  testSpeechModel: document.querySelector("#testSpeechModelButton"),
  modelTestStatus: document.querySelector("#modelTestStatus"),
  ollamaEnabled: document.querySelector("#ollamaEnabled"),
  ollamaTextModel: document.querySelector("#ollamaTextModel"),
  ollamaVisionModel: document.querySelector("#ollamaVisionModel"),
  ollamaFallback: document.querySelector("#ollamaFallback"),
  ollamaStatus: document.querySelector("#ollamaStatus"),
  voiceEnabled: document.querySelector("#voiceEnabled"),
  commentaryEnabled: document.querySelector("#commentaryEnabled"),
  commentaryInterval: document.querySelector("#commentaryInterval"),
  coldTurkeyEnabled: document.querySelector("#coldTurkeyEnabled"),
  coldTurkeyBlockName: document.querySelector("#coldTurkeyBlockName"),
  coldTurkeyPenaltyBlockName: document.querySelector("#coldTurkeyPenaltyBlockName"),
  ttsVoicePreset: document.querySelector("#ttsVoicePreset"),
  ttsVoiceCustomLabel: document.querySelector("#ttsVoiceCustomLabel"),
  ttsVoice: document.querySelector("#ttsVoice"),
  ttsSpeed: document.querySelector("#ttsSpeed"),
  previewVoice: document.querySelector("#previewVoiceButton"),
  personalityPrompt: document.querySelector("#personalityPrompt"),
  savePersonality: document.querySelector("#savePersonalityButton"),
  resetPersonality: document.querySelector("#resetPersonalityButton"),
  apiHint: document.querySelector("#apiHint"),
  start: document.querySelector("#startButton"),
  stop: document.querySelector("#stopButton"),
  startEntertainment: document.querySelector("#startEntertainmentButton"),
  stopEntertainment: document.querySelector("#stopEntertainmentButton"),
  entertainmentCommentaryEnabled: document.querySelector("#entertainmentCommentaryEnabled"),
  entertainmentInterval: document.querySelector("#entertainmentInterval"),
  entertainmentDuration: document.querySelector("#entertainmentDuration"),
  entertainmentDurationLabel: document.querySelector("#entertainmentDurationLabel"),
  entertainmentCost: document.querySelector("#entertainmentCost"),
  entertainmentAccessStatus: document.querySelector("#entertainmentAccessStatus"),
  startEntertainmentGuard: document.querySelector("#startEntertainmentGuardButton"),
  entertainmentGuardStatus: document.querySelector("#entertainmentGuardStatus"),
  stopModal: document.querySelector("#stopModal"),
  completionEvidence: document.querySelector("#completionEvidence"),
  stopReviewMessage: document.querySelector("#stopReviewMessage"),
  submitEvidence: document.querySelector("#submitEvidenceButton"),
  cancelStop: document.querySelector("#cancelStopButton"),
  forceStop: document.querySelector("#forceStopButton"),
  rewardPoints: document.querySelector("#rewardPoints"),
  rewardRank: document.querySelector("#rewardRank"),
  completedSessions: document.querySelector("#completedSessions"),
  punishmentStatus: document.querySelector("#punishmentStatus"),
  coldTurkeyStatusText: document.querySelector("#coldTurkeyStatusText"),
  penaltyLockStatus: document.querySelector("#penaltyLockStatus"),
  coldTurkeyPassword: document.querySelector("#coldTurkeyPassword"),
  revealPreviousColdTurkeyPassword: document.querySelector("#revealPreviousColdTurkeyPasswordButton"),
  confirmColdTurkeyUnlocked: document.querySelector("#confirmColdTurkeyUnlockedButton"),
  recoverColdTurkey: document.querySelector("#recoverColdTurkeyButton"),
  timer: document.querySelector("#timer"),
  currentTask: document.querySelector("#currentTask"),
  badge: document.querySelector("#statusBadge"),
  dot: document.querySelector("#verdictDot"),
  verdict: document.querySelector("#verdict"),
  reason: document.querySelector("#reason"),
  aiUsage: document.querySelector("#aiUsage"),
  history: document.querySelector("#history"),
  checkinBox: document.querySelector("#checkinBox"),
  checkinText: document.querySelector("#checkinText"),
  checkinButton: document.querySelector("#checkinButton"),
  dailyPlanStatus: document.querySelector("#dailyPlanStatus"),
  dailyPlanReminderEnabled: document.querySelector("#dailyPlanReminderEnabled"),
  dailyPlanReminderTime: document.querySelector("#dailyPlanReminderTime"),
  dailyPlanInput: document.querySelector("#dailyPlanInput"),
  generateDailyPlan: document.querySelector("#generateDailyPlanButton"),
  dailyPlanItems: document.querySelector("#dailyPlanItems"),
  dailyPlanEvidenceModal: document.querySelector("#dailyPlanEvidenceModal"),
  dailyPlanEvidenceTitle: document.querySelector("#dailyPlanEvidenceTitle"),
  dailyPlanEvidenceTask: document.querySelector("#dailyPlanEvidenceTask"),
  dailyPlanEvidence: document.querySelector("#dailyPlanEvidence"),
  dailyPlanEvidenceImagePanel: document.querySelector("#dailyPlanEvidenceImagePanel"),
  dailyPlanEvidenceImagePreview: document.querySelector("#dailyPlanEvidenceImagePreview"),
  removeDailyPlanEvidenceImage: document.querySelector("#removeDailyPlanEvidenceImageButton"),
  dailyPlanReviewMessage: document.querySelector("#dailyPlanReviewMessage"),
  submitDailyPlanEvidence: document.querySelector("#submitDailyPlanEvidenceButton"),
  cancelDailyPlanEvidence: document.querySelector("#cancelDailyPlanEvidenceButton"),
  openWinterSupervision: document.querySelector("#openWinterSupervisionButton")
};

let preferencesHydrated = false;
let preferencesSaveTimer;
let selectedDailyPlanItemId = "";
let dailyPlanEvidenceImageDataUrl = "";

function clearDailyPlanEvidenceImage() {
  dailyPlanEvidenceImageDataUrl = "";
  elements.dailyPlanEvidenceImagePreview.removeAttribute("src");
  elements.dailyPlanEvidenceImagePanel.classList.add("hidden");
}

function evidenceImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取剪贴板图片"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("剪贴板图片格式无法识别"));
      image.onload = () => {
        const maxDimension = 1800;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function collectPreferences() {
  return {
    task: elements.task.value,
    durationMinutes: elements.duration.value,
    textModel: elements.textModel.value,
    visionModel: elements.visionModel.value,
    aiModel: elements.textModel.value,
    apiProviderName: elements.apiProviderName.value,
    apiBaseUrl: elements.textApiBaseUrl.value,
    textApiBaseUrl: elements.textApiBaseUrl.value,
    visionApiBaseUrl: elements.visionApiBaseUrl.value,
    ttsProvider: elements.ttsProvider.value,
    ttsApiBaseUrl: elements.ttsApiBaseUrl.value,
    ttsModel: elements.ttsModel.value,
    allowedKeywords: elements.allowed.value,
    blockedKeywords: elements.blocked.value,
    autoDetectGames: elements.autoDetectGames.checked,
    aiEnabled: elements.aiEnabled.checked,
    visionQuality: elements.visionQuality.value,
    ollamaEnabled: elements.ollamaEnabled.checked,
    ollamaTextModel: elements.ollamaTextModel.value,
    ollamaVisionModel: elements.ollamaVisionModel.value,
    ollamaFallbackToOpenAi: elements.ollamaFallback.checked,
    voiceEnabled: elements.voiceEnabled.checked,
    commentaryEnabled: elements.commentaryEnabled.checked,
    commentaryIntervalMinutes: elements.commentaryInterval.value,
    coldTurkeyEnabled: elements.coldTurkeyEnabled.checked,
    coldTurkeyBlockName: elements.coldTurkeyBlockName.value,
    coldTurkeyPenaltyBlockName: elements.coldTurkeyPenaltyBlockName.value,
    ttsVoice: currentTtsVoice(),
    ttsSpeed: elements.ttsSpeed.value,
    entertainmentCommentaryEnabled: elements.entertainmentCommentaryEnabled.checked,
    entertainmentIntervalSeconds: elements.entertainmentInterval.value,
    entertainmentDurationMinutes: elements.entertainmentDuration.value,
    dailyPlanReminderEnabled: elements.dailyPlanReminderEnabled.checked,
    dailyPlanReminderTime: elements.dailyPlanReminderTime.value
  };
}

function hydratePreferences(preferences = {}) {
  elements.task.value = preferences.task ?? elements.task.value;
  elements.duration.value = preferences.durationMinutes ?? elements.duration.value;
  elements.textModel.value = preferences.textModel || preferences.aiModel || elements.textModel.value;
  elements.visionModel.value = preferences.visionModel || preferences.aiModel || elements.textModel.value;
  elements.apiProviderName.value = preferences.apiProviderName || "OpenAI";
  elements.textApiBaseUrl.value = preferences.textApiBaseUrl || preferences.apiBaseUrl || "https://api.openai.com/v1";
  elements.visionApiBaseUrl.value = preferences.visionApiBaseUrl || preferences.apiBaseUrl || elements.textApiBaseUrl.value;
  elements.ttsProvider.value = preferences.ttsProvider || "openai";
  elements.ttsApiBaseUrl.value = preferences.ttsApiBaseUrl || preferences.apiBaseUrl || elements.textApiBaseUrl.value;
  elements.ttsModel.value = preferences.ttsModel || "";
  elements.allowed.value = preferences.allowedKeywords ?? "";
  elements.blocked.value = preferences.blockedKeywords ?? "";
  elements.autoDetectGames.checked = preferences.autoDetectGames !== false;
  elements.aiEnabled.checked = preferences.aiEnabled !== false;
  elements.visionQuality.value = preferences.visionQuality || "high";
  elements.ollamaEnabled.checked = Boolean(preferences.ollamaEnabled);
  elements.ollamaTextModel.value = preferences.ollamaTextModel || "qwen3:8b";
  elements.ollamaVisionModel.value = preferences.ollamaVisionModel || "qwen3-vl:8b";
  elements.ollamaFallback.checked = preferences.ollamaFallbackToOpenAi !== false;
  elements.voiceEnabled.checked = preferences.voiceEnabled !== false;
  elements.commentaryEnabled.checked = preferences.commentaryEnabled !== false;
  elements.commentaryInterval.value = preferences.commentaryIntervalMinutes ?? 10;
  elements.coldTurkeyEnabled.checked = Boolean(preferences.coldTurkeyEnabled);
  elements.coldTurkeyBlockName.value = preferences.coldTurkeyBlockName || "AI Commissar";
  elements.coldTurkeyPenaltyBlockName.value = preferences.coldTurkeyPenaltyBlockName || "Games";
  renderTtsVoicePresets(elements.ttsProvider.value, preferences.ttsVoice || TTS_DEFAULTS[elements.ttsProvider.value]?.voice);
  elements.ttsSpeed.value = preferences.ttsSpeed ?? 1.1;
  elements.entertainmentCommentaryEnabled.checked = preferences.entertainmentCommentaryEnabled !== false;
  elements.entertainmentInterval.value = preferences.entertainmentIntervalSeconds ?? 60;
  elements.entertainmentDuration.value = preferences.entertainmentDurationMinutes ?? 30;
  elements.dailyPlanReminderEnabled.checked = Boolean(preferences.dailyPlanReminderEnabled);
  elements.dailyPlanReminderTime.value = preferences.dailyPlanReminderTime || "09:00";
}

function applyTtsProviderDefaults() {
  const provider = elements.ttsProvider.value;
  if (provider === "qwen") {
    if (!elements.ttsApiBaseUrl.value.trim() || elements.ttsApiBaseUrl.value.trim() === TTS_DEFAULTS.openai.baseUrl) {
      elements.ttsApiBaseUrl.value = TTS_DEFAULTS.qwen.baseUrl;
    }
    if (!elements.ttsModel.value.trim() || elements.ttsModel.value.trim() === TTS_DEFAULTS.openai.model) {
      elements.ttsModel.value = TTS_DEFAULTS.qwen.model;
    }
    const voice = currentTtsVoice();
    renderTtsVoicePresets("qwen", ttsPresetValues("openai").some((preset) => preset.value === voice)
      ? TTS_DEFAULTS.qwen.voice
      : voice);
  } else {
    if (!elements.ttsApiBaseUrl.value.trim() || elements.ttsApiBaseUrl.value.trim() === TTS_DEFAULTS.qwen.baseUrl) {
      elements.ttsApiBaseUrl.value = TTS_DEFAULTS.openai.baseUrl;
    }
    if (!elements.ttsModel.value.trim() || elements.ttsModel.value.trim() === TTS_DEFAULTS.qwen.model) {
      elements.ttsModel.value = TTS_DEFAULTS.openai.model;
    }
    const voice = currentTtsVoice();
    renderTtsVoicePresets("openai", ttsPresetValues("qwen").some((preset) => preset.value === voice)
      ? TTS_DEFAULTS.openai.voice
      : voice);
  }
}

function schedulePreferencesSave() {
  if (!preferencesHydrated) return;
  clearTimeout(preferencesSaveTimer);
  preferencesSaveTimer = setTimeout(() => {
    void window.commissar.savePreferences(collectPreferences());
  }, 350);
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function verdictLabel(verdict) {
  return {
    focused: "在推进",
    distracted: "明显偏离",
    unknown: "暂不确定",
    checkin: "已报到",
    commentary: "战地点评",
    entertainment: "娱乐点评"
  }[verdict] || "等待观察";
}

function render(state) {
  if (!preferencesHydrated) {
    hydratePreferences(state.settings?.preferences);
    preferencesHydrated = true;
  }
  const entertainmentActive = Boolean(state.entertainment?.active);
  const guardActive = Boolean(state.entertainment?.guard?.active);
  const entertainmentMinutes = Math.max(5, Math.min(240, Number(elements.entertainmentDuration.value) || 30));
  const entertainmentCost = Math.ceil(entertainmentMinutes / 5);
  const access = state.entertainmentAccess || {};
  const exceedsDailyTime = access.remainingMinutes !== null
    && access.remainingMinutes !== undefined
    && entertainmentMinutes > access.remainingMinutes;
  elements.entertainmentDuration.max = access.remainingMinutes === null
    ? 240
    : Math.max(5, Math.min(240, access.remainingMinutes || 5));
  elements.timer.textContent = formatTime(
    entertainmentActive && state.entertainment.paid
      ? state.entertainment.remainingSeconds || 0
      : entertainmentActive
        ? state.entertainment.elapsedSeconds || 0
        : state.remainingSeconds || 0
  );
  elements.currentTask.textContent = state.running
    ? state.task
    : entertainmentActive
      ? state.entertainment.commentaryEnabled
        ? `津贴娱乐中 · 每 ${state.entertainment.intervalSeconds || 60} 秒观察 · 已记住 ${state.entertainment.memoryTurns || 0} 轮`
        : "津贴娱乐中 · AI 点评已关闭"
      : "尚未开始";
  elements.badge.textContent = state.running ? "监督中" : entertainmentActive ? "娱乐中" : state.status;
  elements.start.disabled = state.running || entertainmentActive
    || (elements.coldTurkeyEnabled.checked && state.coldTurkey?.awaitingUnlockConfirmation);
  elements.stop.disabled = !state.running;
  elements.startEntertainment.disabled = state.running || entertainmentActive
    || (elements.entertainmentCommentaryEnabled.checked && !state.apiKeysAvailable?.vision && !state.ollama?.available)
    || (state.rewards?.points || 0) < entertainmentCost
    || Boolean(access.blockedByPenalty)
    || !access.focusRequirementMet
    || exceedsDailyTime;
  elements.stopEntertainment.disabled = !entertainmentActive;
  elements.entertainmentCommentaryEnabled.disabled = entertainmentActive;
  elements.entertainmentInterval.disabled = entertainmentActive;
  elements.entertainmentDuration.disabled = entertainmentActive;
  elements.entertainmentCost.textContent = `需要 ${entertainmentCost} 点`;
  elements.startEntertainment.textContent = `使用津贴开启（${entertainmentCost} 点）`;
  const limitLabel = access.dailyLimitMinutes === null
    ? "周末津贴不限时"
    : `今日津贴 ${access.dailyLimitMinutes} 分钟，余额 ${access.remainingMinutes ?? 0} 分钟`;
  const focusLabel = access.workday
    ? `工作日专注 ${access.focusedMinutes || 0}/180 分钟`
    : "周末无需专注门槛";
  elements.entertainmentAccessStatus.textContent = [
    "津贴兑换比例：1 荣誉点 = 5 分钟",
    focusLabel,
    limitLabel,
    access.blockedByPenalty ? "惩戒营禁止娱乐" : `当前军衔：${access.rank || "列兵"}`
  ].join(" · ");
  elements.startEntertainmentGuard.disabled = guardActive || state.running || entertainmentActive
    || !state.coldTurkey?.available || !state.coldTurkey?.encryptionAvailable;
  const guardRemaining = state.entertainment?.guard?.remainingSeconds || 0;
  elements.entertainmentGuardStatus.textContent = guardActive
    ? `限制中，剩余 ${Math.floor(guardRemaining / 3600)} 小时 ${Math.ceil((guardRemaining % 3600) / 60)} 分钟`
    : "未开启限制";
  if (!state.running) elements.stopModal.classList.add("hidden");
  elements.rewardPoints.textContent = state.rewards?.points ?? 0;
  elements.rewardRank.textContent = state.rewards?.rank || "列兵";
  elements.completedSessions.textContent = state.rewards?.completedSessions || 0;
  const focusEndsAt = state.coldTurkey?.focusEndsAt || 0;
  const focusTime = focusEndsAt > Date.now()
    ? ` · 应用将在 ${new Date(focusEndsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 公布密码`
    : "";
  elements.coldTurkeyStatusText.textContent = `${state.coldTurkey?.status || "未启用"}${focusTime}`;
  const penaltyBlock = state.coldTurkey?.penaltyBlockName
    || elements.coldTurkeyPenaltyBlockName.value
    || "Games";
  elements.penaltyLockStatus.textContent = `惩戒营 ${penaltyBlock} 锁：${state.coldTurkey?.penaltyStatus || "未启用"}`;
  const password = state.coldTurkey?.passwordRevealed || "";
  elements.coldTurkeyPassword.textContent = password ? `解锁密码：${password}` : "";
  elements.coldTurkeyPassword.classList.toggle("hidden", !password);
  elements.confirmColdTurkeyUnlocked.classList.toggle(
    "hidden",
    !state.coldTurkey?.awaitingUnlockConfirmation
  );
  elements.revealPreviousColdTurkeyPassword.classList.toggle(
    "hidden",
    !state.coldTurkey?.previousPasswordAvailable
  );
  elements.recoverColdTurkey.classList.toggle("hidden", !state.coldTurkey?.recoveryAvailable);
  const coldTurkeyReady = Boolean(state.coldTurkey?.available && state.coldTurkey?.encryptionAvailable);
  if (!coldTurkeyReady && !state.running) elements.coldTurkeyEnabled.checked = false;
  elements.coldTurkeyEnabled.disabled = !coldTurkeyReady || state.running || entertainmentActive || guardActive;
  elements.coldTurkeyBlockName.disabled = state.running || entertainmentActive || guardActive;
  elements.coldTurkeyPenaltyBlockName.disabled = state.running || entertainmentActive;
  const punishmentSeconds = state.rewards?.punishmentRemainingSeconds || 0;
  const inPunishment = state.rewards?.rank === "惩戒营";
  elements.punishmentStatus.classList.toggle("hidden", !inPunishment);
  elements.punishmentStatus.textContent = punishmentSeconds > 0
    ? `惩戒营剩余 ${Math.ceil(punishmentSeconds / 3600)} 小时，当前 ${state.rewards.points} 点：${state.rewards.punishmentReason}`
    : `惩戒营：当前 ${state.rewards.points} 点，完成专注任务并恢复到 0 后归队。`;
  if (document.activeElement !== elements.personalityPrompt) {
    elements.personalityPrompt.value = state.settings?.personalityPrompt || "";
  }
  const apiKeys = state.apiKeysAvailable || {};
  const keyLabels = [
    apiKeys.text ? "文字 Key" : "",
    apiKeys.vision ? "视觉 Key" : "",
    apiKeys.tts ? "语音 Key" : ""
  ].filter(Boolean).join("、");
  elements.apiHint.textContent = keyLabels
    ? `已配置 ${state.apiProvider || "兼容 API"}：${keyLabels}。AI 功能仍需手动勾选。`
    : state.ollama?.available
      ? "未配置兼容 API Key；可使用 Ollama，AI 语音不可用。"
      : "未配置兼容 API Key，将只使用本地规则。";
  elements.textCompatibleApiKey.placeholder = apiKeys.text
    ? "文字 Key 已加密保存；输入新 Key 可替换"
    : "输入文字 API Key，保存后不会再显示";
  elements.visionCompatibleApiKey.placeholder = apiKeys.vision
    ? "视觉 Key 已加密保存；输入新 Key 可替换"
    : "输入视觉 API Key，或点击同文字 Key";
  elements.ttsCompatibleApiKey.placeholder = apiKeys.tts
    ? "语音 Key 已加密保存；输入新 Key 可替换"
    : "输入语音 API Key，或点击同文字 Key";
  const installedModels = (state.ollama?.models || []).map((model) => model.name);
  elements.ollamaStatus.textContent = state.ollama?.available
    ? `Ollama 在线。已安装：${installedModels.join(", ") || "暂无模型"}`
    : `Ollama 离线：${state.ollama?.error || "无法连接本地服务"}`;
  elements.ollamaEnabled.disabled = !state.ollama?.available || state.running || entertainmentActive;
  elements.ollamaTextModel.disabled = state.running || entertainmentActive;
  elements.ollamaVisionModel.disabled = state.running || entertainmentActive;
  elements.ollamaFallback.disabled = state.running || entertainmentActive;
  elements.textModel.disabled = state.running || entertainmentActive;
  elements.visionModel.disabled = state.running || entertainmentActive;
  elements.copyTextModelToVision.disabled = state.running || entertainmentActive;
  elements.apiProviderName.disabled = state.running || entertainmentActive;
  elements.textApiBaseUrl.disabled = state.running || entertainmentActive;
  elements.visionApiBaseUrl.disabled = state.running || entertainmentActive;
  elements.ttsProvider.disabled = state.running || entertainmentActive;
  elements.ttsApiBaseUrl.disabled = state.running || entertainmentActive;
  elements.textCompatibleApiKey.disabled = state.running || entertainmentActive;
  elements.visionCompatibleApiKey.disabled = state.running || entertainmentActive;
  elements.ttsCompatibleApiKey.disabled = state.running || entertainmentActive;
  elements.copyTextKeyToVision.disabled = state.running || entertainmentActive;
  elements.copyTextKeyToTts.disabled = state.running || entertainmentActive;
  [
    elements.saveTextApiKey,
    elements.clearTextApiKey,
    elements.saveVisionApiKey,
    elements.clearVisionApiKey,
    elements.saveTtsApiKey,
    elements.clearTtsApiKey,
    elements.testTextModel,
    elements.testVisionModel,
    elements.testSpeechModel
  ].forEach((button) => {
    button.disabled = state.running || entertainmentActive;
  });
  if (state.modelTest) {
    elements.modelTestStatus.textContent = state.modelTest.ok
      ? `测试成功：${state.modelTest.provider || "兼容 API"} · ${state.modelTest.model || "未显示模型"} · ${state.modelTest.baseUrl || "未显示 Base URL"} · ${state.modelTest.message || ""}`
      : `测试失败：${state.modelTest.message || "未知错误"}`;
  }
  elements.ttsModel.disabled = state.running || entertainmentActive;
  const ttsAvailable = Boolean(elements.ttsModel.value.trim());
  if (!ttsAvailable && !state.running && !entertainmentActive) elements.voiceEnabled.checked = false;
  elements.voiceEnabled.disabled = !ttsAvailable || state.running || entertainmentActive;
  elements.ttsVoicePreset.disabled = !ttsAvailable || state.running || entertainmentActive;
  elements.ttsVoice.disabled = !ttsAvailable || state.running || entertainmentActive
    || elements.ttsVoicePreset.value !== "__custom__";
  elements.ttsSpeed.disabled = !ttsAvailable || state.running || entertainmentActive;
  elements.previewVoice.disabled = !ttsAvailable || state.running || entertainmentActive;
  elements.visionQuality.disabled = state.running || entertainmentActive;
  elements.aiEnabled.disabled = (!state.apiKeyAvailable && !state.ollama?.available) || state.running || entertainmentActive;

  const latest = state.latest;
  const verdict = latest?.verdict || "unknown";
  elements.dot.className = `dot ${verdict}`;
  elements.verdict.textContent = verdictLabel(verdict);
  elements.reason.textContent = latest?.reason || state.status || "只在专注会话中读取前台窗口。";
  const contentUsage = state.aiUsage?.content;
  const speechUsage = state.aiUsage?.speech;
  const contentLabel = contentUsage
    ? `${contentUsage.modality === "vision" ? "视觉" : "文字"}：${contentUsage.provider} ${contentUsage.model}${contentUsage.fallback ? "（由 Ollama 回退）" : ""}`
    : null;
  const speechLabel = speechUsage
    ? `语音：${speechUsage.provider} ${speechUsage.model}`
    : null;
  elements.aiUsage.textContent = `AI 来源：${[contentLabel, speechLabel].filter(Boolean).join("；") || "尚未调用模型"}`;
  elements.checkinBox.classList.toggle("hidden", state.intervention !== "checkin");

  const dailyPlan = state.dailyPlan || {};
  elements.dailyPlanStatus.textContent = `${dailyPlan.date || "今日"} · ${dailyPlan.status || "尚未生成计划"}`;
  elements.generateDailyPlan.disabled = (dailyPlan.items || []).length >= 12;
  elements.generateDailyPlan.textContent = dailyPlan.generatedAt ? "AI 追加新目标" : "AI 生成今日计划";
  if (
    !dailyPlan.generatedAt
    && document.activeElement !== elements.dailyPlanInput
    && !elements.dailyPlanInput.value
    && dailyPlan.sourceTasks
  ) {
    elements.dailyPlanInput.value = dailyPlan.sourceTasks;
  }
  elements.dailyPlanItems.replaceChildren(...(dailyPlan.items || []).map((item) => {
    const li = document.createElement("li");
    li.className = item.completed ? "completed" : "";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const details = document.createElement("p");
    const time = document.createElement("small");
    const action = document.createElement("button");
    title.textContent = item.title;
    details.textContent = item.details || "按计划完成并提交可核验证据。";
    time.textContent = item.completed
      ? `已于 ${new Date(item.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 完成`
      : item.suggestedTime || "今日完成";
    action.type = "button";
    action.className = item.completed ? "quiet" : "secondary";
    action.textContent = item.completed ? "已奖励 +1" : "提交完成证据";
    action.disabled = item.completed;
    action.addEventListener("click", () => {
      selectedDailyPlanItemId = item.id;
      elements.dailyPlanEvidenceTitle.textContent = item.title;
      elements.dailyPlanEvidenceTask.textContent = item.details || "请提交具体、可核验的完成证据。";
      elements.dailyPlanEvidence.value = "";
      clearDailyPlanEvidenceImage();
      elements.dailyPlanReviewMessage.textContent = "";
      elements.dailyPlanEvidenceModal.classList.remove("hidden");
      elements.dailyPlanEvidence.focus();
    });
    content.append(title, details, time);
    li.append(content, action);
    return li;
  }));

  elements.history.replaceChildren(...(state.history || []).map((item) => {
    const li = document.createElement("li");
    const time = document.createElement("span");
    const status = document.createElement("strong");
    const detail = document.createElement("span");
    time.textContent = new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    status.textContent = verdictLabel(item.verdict);
    status.className = item.verdict;
    detail.textContent = item.reason || item.title || "";
    li.append(time, status, detail);
    return li;
  }));
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearTimeout(preferencesSaveTimer);
  await window.commissar.savePreferences(collectPreferences());
  render(await window.commissar.start({
    task: elements.task.value,
    durationMinutes: elements.duration.value,
    textModel: elements.textModel.value,
    visionModel: elements.visionModel.value,
    aiModel: elements.textModel.value,
    ttsModel: elements.ttsModel.value,
    ttsProvider: elements.ttsProvider.value,
    textApiBaseUrl: elements.textApiBaseUrl.value,
    visionApiBaseUrl: elements.visionApiBaseUrl.value,
    ttsApiBaseUrl: elements.ttsApiBaseUrl.value,
    allowedKeywords: elements.allowed.value,
    blockedKeywords: elements.blocked.value,
    autoDetectGames: elements.autoDetectGames.checked,
    aiEnabled: elements.aiEnabled.checked,
    visionQuality: elements.visionQuality.value,
    ollamaEnabled: elements.ollamaEnabled.checked,
    ollamaTextModel: elements.ollamaTextModel.value,
    ollamaVisionModel: elements.ollamaVisionModel.value,
    ollamaFallbackToOpenAi: elements.ollamaFallback.checked,
    voiceEnabled: elements.voiceEnabled.checked,
    commentaryEnabled: elements.commentaryEnabled.checked,
    commentaryIntervalMinutes: elements.commentaryInterval.value,
    coldTurkeyEnabled: elements.coldTurkeyEnabled.checked,
    coldTurkeyBlockName: elements.coldTurkeyBlockName.value,
    coldTurkeyPenaltyBlockName: elements.coldTurkeyPenaltyBlockName.value,
    ttsVoice: currentTtsVoice(),
    ttsSpeed: elements.ttsSpeed.value
  }));
});

elements.startEntertainment.addEventListener("click", async () => {
  clearTimeout(preferencesSaveTimer);
  await window.commissar.savePreferences(collectPreferences());
  render(await window.commissar.startEntertainment({
    textModel: elements.textModel.value,
    visionModel: elements.visionModel.value,
    aiModel: elements.textModel.value,
    ttsModel: elements.ttsModel.value,
    ttsProvider: elements.ttsProvider.value,
    textApiBaseUrl: elements.textApiBaseUrl.value,
    visionApiBaseUrl: elements.visionApiBaseUrl.value,
    ttsApiBaseUrl: elements.ttsApiBaseUrl.value,
    visionQuality: elements.visionQuality.value,
    ollamaEnabled: elements.ollamaEnabled.checked,
    ollamaVisionModel: elements.ollamaVisionModel.value,
    ollamaFallbackToOpenAi: elements.ollamaFallback.checked,
    ttsVoice: currentTtsVoice(),
    ttsSpeed: elements.ttsSpeed.value,
    commentaryEnabled: elements.entertainmentCommentaryEnabled.checked,
    intervalSeconds: elements.entertainmentInterval.value,
    durationMinutes: elements.entertainmentDuration.value
  }));
});
elements.stopEntertainment.addEventListener("click", async () => {
  render(await window.commissar.stopEntertainment());
});
elements.startEntertainmentGuard.addEventListener("click", async () => {
  clearTimeout(preferencesSaveTimer);
  await window.commissar.savePreferences(collectPreferences());
  render(await window.commissar.startEntertainmentGuard(elements.coldTurkeyBlockName.value));
});
elements.entertainmentDuration.addEventListener("input", () => {
  window.commissar.getState().then(render);
});
elements.ttsProvider.addEventListener("change", () => {
  applyTtsProviderDefaults();
  schedulePreferencesSave();
});
elements.ttsVoicePreset.addEventListener("change", () => {
  elements.ttsVoiceCustomLabel.classList.toggle("hidden", elements.ttsVoicePreset.value !== "__custom__");
  schedulePreferencesSave();
});
elements.copyTextModelToVision.addEventListener("click", () => {
  elements.visionModel.value = elements.textModel.value;
  elements.visionApiBaseUrl.value = elements.textApiBaseUrl.value;
  schedulePreferencesSave();
});

[
  elements.task,
  elements.duration,
  elements.textModel,
  elements.visionModel,
  elements.apiProviderName,
  elements.textApiBaseUrl,
  elements.visionApiBaseUrl,
  elements.ttsProvider,
  elements.ttsApiBaseUrl,
  elements.ttsModel,
  elements.allowed,
  elements.blocked,
  elements.autoDetectGames,
  elements.aiEnabled,
  elements.visionQuality,
  elements.ollamaEnabled,
  elements.ollamaTextModel,
  elements.ollamaVisionModel,
  elements.ollamaFallback,
  elements.voiceEnabled,
  elements.commentaryEnabled,
  elements.commentaryInterval,
  elements.coldTurkeyEnabled,
  elements.coldTurkeyBlockName,
  elements.coldTurkeyPenaltyBlockName,
  elements.ttsVoicePreset,
  elements.ttsVoice,
  elements.ttsSpeed,
  elements.entertainmentCommentaryEnabled,
  elements.entertainmentInterval,
  elements.entertainmentDuration,
  elements.dailyPlanReminderEnabled,
  elements.dailyPlanReminderTime
].forEach((element) => {
  element.addEventListener("input", schedulePreferencesSave);
  element.addEventListener("change", schedulePreferencesSave);
});

elements.stop.addEventListener("click", () => {
  elements.stopReviewMessage.textContent = "";
  elements.stopModal.classList.remove("hidden");
  elements.completionEvidence.focus();
});
elements.cancelStop.addEventListener("click", () => elements.stopModal.classList.add("hidden"));
elements.submitEvidence.addEventListener("click", async () => {
  elements.submitEvidence.disabled = true;
  elements.submitEvidence.textContent = "正在审查...";
  const result = await window.commissar.requestStop(elements.completionEvidence.value);
  render(result);
  elements.stopReviewMessage.textContent = result.stopReview?.reason || "";
  elements.submitEvidence.disabled = false;
  elements.submitEvidence.textContent = "提交证据";
  if (result.stopReview?.accepted) {
    elements.stopModal.classList.add("hidden");
    elements.completionEvidence.value = "";
  }
});
elements.forceStop.addEventListener("click", async () => {
  render(await window.commissar.forceStop());
  elements.stopModal.classList.add("hidden");
});
elements.previewVoice.addEventListener("click", async () => {
  elements.previewVoice.disabled = true;
  elements.previewVoice.textContent = "正在发声...";
  render(await window.commissar.previewVoice({
    voice: currentTtsVoice(),
    speed: elements.ttsSpeed.value,
    ttsProvider: elements.ttsProvider.value,
    ttsApiBaseUrl: elements.ttsApiBaseUrl.value,
    ttsModel: elements.ttsModel.value
  }));
  elements.previewVoice.disabled = false;
  elements.previewVoice.textContent = "试听";
});

async function testModel(kind, button) {
  clearTimeout(preferencesSaveTimer);
  await window.commissar.savePreferences(collectPreferences());
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "测试中...";
  elements.modelTestStatus.textContent = "正在测试，请稍候...";
  render(await window.commissar.testModel(kind, collectPreferences()));
  button.disabled = false;
  button.textContent = previousText;
}

elements.testTextModel.addEventListener("click", () => testModel("text", elements.testTextModel));
elements.testVisionModel.addEventListener("click", () => testModel("vision", elements.testVisionModel));
elements.testSpeechModel.addEventListener("click", () => testModel("speech", elements.testSpeechModel));
elements.savePersonality.addEventListener("click", async () => {
  render(await window.commissar.savePersonality(elements.personalityPrompt.value));
});
elements.resetPersonality.addEventListener("click", async () => {
  render(await window.commissar.resetPersonality());
});
elements.recoverColdTurkey.addEventListener("click", async () => {
  render(await window.commissar.recoverColdTurkey());
});

async function saveApiKey(scope, input) {
  if (!input.value.trim()) return;
  clearTimeout(preferencesSaveTimer);
  await window.commissar.savePreferences(collectPreferences());
  render(await window.commissar.saveCompatibleApiKey(scope, input.value));
  input.value = "";
}

async function clearApiKey(scope, input) {
  render(await window.commissar.saveCompatibleApiKey(scope, ""));
  input.value = "";
}

async function copyTextKeyTo(scope, input) {
  if (elements.textCompatibleApiKey.value.trim()) {
    input.value = elements.textCompatibleApiKey.value;
    return;
  }
  render(await window.commissar.copyCompatibleApiKey("text", scope));
}

elements.saveTextApiKey.addEventListener("click", () => saveApiKey("text", elements.textCompatibleApiKey));
elements.clearTextApiKey.addEventListener("click", () => clearApiKey("text", elements.textCompatibleApiKey));
elements.saveVisionApiKey.addEventListener("click", () => saveApiKey("vision", elements.visionCompatibleApiKey));
elements.clearVisionApiKey.addEventListener("click", () => clearApiKey("vision", elements.visionCompatibleApiKey));
elements.saveTtsApiKey.addEventListener("click", () => saveApiKey("tts", elements.ttsCompatibleApiKey));
elements.clearTtsApiKey.addEventListener("click", () => clearApiKey("tts", elements.ttsCompatibleApiKey));
elements.copyTextKeyToVision.addEventListener("click", () => {
  copyTextKeyTo("vision", elements.visionCompatibleApiKey);
});
elements.copyTextKeyToTts.addEventListener("click", () => {
  copyTextKeyTo("tts", elements.ttsCompatibleApiKey);
});
elements.confirmColdTurkeyUnlocked.addEventListener("click", async () => {
  render(await window.commissar.confirmColdTurkeyUnlocked());
});
elements.revealPreviousColdTurkeyPassword.addEventListener("click", async () => {
  render(await window.commissar.revealPreviousColdTurkeyPassword());
});
elements.checkinButton.addEventListener("click", async () => {
  render(await window.commissar.checkIn(elements.checkinText.value));
  elements.checkinText.value = "";
});
elements.generateDailyPlan.addEventListener("click", async () => {
  elements.generateDailyPlan.disabled = true;
  elements.generateDailyPlan.textContent = "正在制定...";
  const result = await window.commissar.generateDailyPlan(elements.dailyPlanInput.value);
  render(result);
  if (!result.dailyPlanError) elements.dailyPlanInput.value = "";
});
elements.cancelDailyPlanEvidence.addEventListener("click", () => {
  elements.dailyPlanEvidenceModal.classList.add("hidden");
  clearDailyPlanEvidenceImage();
});
elements.removeDailyPlanEvidenceImage.addEventListener("click", clearDailyPlanEvidenceImage);
elements.dailyPlanEvidence.addEventListener("paste", async (event) => {
  const imageItem = [...(event.clipboardData?.items || [])]
    .find((item) => item.type.startsWith("image/"));
  if (!imageItem) return;
  event.preventDefault();
  elements.dailyPlanReviewMessage.textContent = "正在读取截图...";
  try {
    const imageFile = imageItem.getAsFile();
    if (!imageFile) throw new Error("无法从剪贴板取得截图");
    dailyPlanEvidenceImageDataUrl = await evidenceImageDataUrl(imageFile);
    elements.dailyPlanEvidenceImagePreview.src = dailyPlanEvidenceImageDataUrl;
    elements.dailyPlanEvidenceImagePanel.classList.remove("hidden");
    elements.dailyPlanReviewMessage.textContent = "截图已粘贴，可补充文字说明后提交。";
  } catch (error) {
    clearDailyPlanEvidenceImage();
    elements.dailyPlanReviewMessage.textContent = error.message;
  }
});
elements.submitDailyPlanEvidence.addEventListener("click", async () => {
  elements.submitDailyPlanEvidence.disabled = true;
  elements.submitDailyPlanEvidence.textContent = "正在审核...";
  const result = await window.commissar.completeDailyPlanItem(
    selectedDailyPlanItemId,
    elements.dailyPlanEvidence.value,
    dailyPlanEvidenceImageDataUrl
  );
  render(result);
  elements.dailyPlanReviewMessage.textContent = result.dailyPlanReview?.reason || "";
  elements.submitDailyPlanEvidence.disabled = false;
  elements.submitDailyPlanEvidence.textContent = "提交证据";
  if (result.dailyPlanReview?.accepted) {
    elements.dailyPlanEvidenceModal.classList.add("hidden");
    clearDailyPlanEvidenceImage();
  }
});
elements.openWinterSupervision.addEventListener("click", async () => {
  elements.openWinterSupervision.disabled = true;
  elements.openWinterSupervision.textContent = "正在打开...";
  try {
    await window.commissar.openWinterSupervision();
  } finally {
    elements.openWinterSupervision.disabled = false;
    elements.openWinterSupervision.textContent = "一键开启凛冬督学局";
  }
});

window.commissar.onState(render);
window.commissar.getState().then(render);
setInterval(() => window.commissar.getState().then(render), 60000);
