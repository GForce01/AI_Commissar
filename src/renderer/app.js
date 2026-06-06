const elements = {
  form: document.querySelector("#sessionForm"),
  task: document.querySelector("#task"),
  duration: document.querySelector("#duration"),
  model: document.querySelector("#model"),
  allowed: document.querySelector("#allowed"),
  blocked: document.querySelector("#blocked"),
  aiEnabled: document.querySelector("#aiEnabled"),
  voiceEnabled: document.querySelector("#voiceEnabled"),
  ttsVoice: document.querySelector("#ttsVoice"),
  previewVoice: document.querySelector("#previewVoiceButton"),
  apiHint: document.querySelector("#apiHint"),
  start: document.querySelector("#startButton"),
  stop: document.querySelector("#stopButton"),
  timer: document.querySelector("#timer"),
  currentTask: document.querySelector("#currentTask"),
  badge: document.querySelector("#statusBadge"),
  dot: document.querySelector("#verdictDot"),
  verdict: document.querySelector("#verdict"),
  reason: document.querySelector("#reason"),
  history: document.querySelector("#history"),
  checkinBox: document.querySelector("#checkinBox"),
  checkinText: document.querySelector("#checkinText"),
  checkinButton: document.querySelector("#checkinButton")
};

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
    checkin: "已报到"
  }[verdict] || "等待观察";
}

function render(state) {
  elements.timer.textContent = formatTime(state.remainingSeconds || 0);
  elements.currentTask.textContent = state.running ? state.task : "尚未开始";
  elements.badge.textContent = state.running ? "监督中" : state.status;
  elements.start.disabled = state.running;
  elements.stop.disabled = !state.running;
  elements.apiHint.textContent = state.apiKeyAvailable
    ? "已检测到 OPENAI_API_KEY。AI 功能仍需手动勾选。"
    : "未检测到 OPENAI_API_KEY，将只使用本地规则。";
  elements.aiEnabled.disabled = !state.apiKeyAvailable || state.running;

  const latest = state.latest;
  const verdict = latest?.verdict || "unknown";
  elements.dot.className = `dot ${verdict}`;
  elements.verdict.textContent = verdictLabel(verdict);
  elements.reason.textContent = latest?.reason || state.status || "只在专注会话中读取前台窗口。";
  elements.checkinBox.classList.toggle("hidden", state.intervention !== "checkin");

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
  render(await window.commissar.start({
    task: elements.task.value,
    durationMinutes: elements.duration.value,
    aiModel: elements.model.value,
    allowedKeywords: elements.allowed.value,
    blockedKeywords: elements.blocked.value,
    aiEnabled: elements.aiEnabled.checked,
    voiceEnabled: elements.voiceEnabled.checked,
    ttsVoice: elements.ttsVoice.value
  }));
});

elements.stop.addEventListener("click", async () => render(await window.commissar.stop()));
elements.previewVoice.addEventListener("click", async () => {
  elements.previewVoice.disabled = true;
  elements.previewVoice.textContent = "正在发声...";
  await window.commissar.previewVoice(elements.ttsVoice.value);
  setTimeout(() => {
    elements.previewVoice.disabled = false;
    elements.previewVoice.textContent = "试听";
  }, 2500);
});
elements.checkinButton.addEventListener("click", async () => {
  render(await window.commissar.checkIn(elements.checkinText.value));
  elements.checkinText.value = "";
});

window.commissar.onState(render);
window.commissar.getState().then(render);
