const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, Notification, screen } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { promisify } = require("node:util");
const { classifyActivity, nextIntervention } = require("./rules");

const execFileAsync = promisify(execFile);

let mainWindow;
let blockerWindow;
let monitorTimer;
let state = {
  running: false,
  task: "",
  remainingSeconds: 0,
  consecutiveDistracted: 0,
  intervention: "none",
  latest: null,
  history: [],
  config: null,
  status: "待命"
};
let sessionEndsAt = 0;
let lastAiCheckAt = 0;
let lastBlockAt = 0;
let speechInFlight = false;

const COMMISSAR_LINES = [
  "同志，注意力已经脱离任务。停止无效游荡，立即回到你承诺要完成的事情上。",
  "我必须提醒你：现在不是放任冲动的时候。收拢注意力，回到当前任务。",
  "不要用短暂的轻松，交换之后更沉重的焦虑。关掉它，继续执行。",
  "目标还在那里，时间正在经过。停止偏航，现在就完成下一步。"
];

function publicState() {
  return { ...state, apiKeyAvailable: Boolean(process.env.OPENAI_API_KEY) };
}

function broadcast() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("state:update", publicState());
  }
}

function addHistory(item) {
  state.history = [item, ...state.history].slice(0, 80);
  try {
    fs.appendFileSync(
      path.join(app.getPath("userData"), "activity.jsonl"),
      `${JSON.stringify(item)}\n`,
      "utf8"
    );
  } catch {
    // The live session should continue even if logging fails.
  }
}

async function getActiveWindow() {
  try {
    const script = path.join(__dirname, "active-window.ps1");
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { windowsHide: true, timeout: 4000 }
    );
    return JSON.parse(stdout.trim());
  } catch {
    return { title: "", processName: "", pid: 0 };
  }
}

async function capturePrimaryScreen() {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.min(1280, display.size.width),
      height: Math.round(Math.min(1280, display.size.width) * display.size.height / display.size.width)
    }
  });
  return sources[0]?.thumbnail.toJPEG(58).toString("base64") || null;
}

function extractResponseText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return "";
}

async function classifyWithAi(activity) {
  const screenshot = await capturePrimaryScreen();
  if (!screenshot) return null;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: state.config.aiModel || "gpt-5.4-mini",
      max_output_tokens: 120,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "你是一个克制、务实的专注监督助手。",
              `用户当前任务：${state.task}`,
              `前台程序：${activity.processName}；窗口：${activity.title}`,
              "判断屏幕内容是否明显在推进任务。",
              '只返回 JSON：{"verdict":"focused|distracted|unknown","reason":"不超过30字"}。',
              "聊天、视频或网页也可能是工作资料；证据不足时必须选 unknown。"
            ].join("\n")
          },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${screenshot}`,
            detail: "low"
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API ${response.status}`);
  }

  const text = extractResponseText(await response.json()).trim();
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  const parsed = JSON.parse(json);
  if (!["focused", "distracted", "unknown"].includes(parsed.verdict)) return null;
  return { verdict: parsed.verdict, reason: `AI：${parsed.reason || "无说明"}` };
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
}

function playWav(filePath) {
  const command = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    `$player = New-Object System.Media.SoundPlayer('${filePath.replaceAll("'", "''")}');`,
    "$player.PlaySync()"
  ].join(" ");
  return execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { windowsHide: true, timeout: 60000 }
  );
}

async function speakWithOpenAi(text, voice = "onyx") {
  const cacheDir = path.join(app.getPath("userData"), "voice-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const hash = crypto.createHash("sha256").update(`${voice}:${text}`).digest("hex").slice(0, 20);
  const audioPath = path.join(cacheDir, `${hash}.wav`);

  if (!fs.existsSync(audioPath)) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text,
        instructions: "Speak in Mandarin Chinese with a deep, resonant adult male voice. Be righteous, stern, composed, and authoritative, like a disciplined political commissar. Do not shout. Use deliberate pacing and crisp articulation.",
        response_format: "wav"
      })
    });
    if (!response.ok) throw new Error(`OpenAI speech ${response.status}`);
    fs.writeFileSync(audioPath, Buffer.from(await response.arrayBuffer()));
  }

  await playWav(audioPath);
}

async function speakCommissar(text) {
  if (speechInFlight) return;
  speechInFlight = true;
  try {
    if (!process.env.OPENAI_API_KEY) {
      state.status = "语音提醒需要 OPENAI_API_KEY";
      broadcast();
      return;
    }
    await speakWithOpenAi(text, state.config?.ttsVoice || "onyx");
  } catch (error) {
    state.status = `OpenAI 语音暂不可用：${error.message}`;
    broadcast();
  } finally {
    speechInFlight = false;
  }
}

function randomCommissarLine() {
  return COMMISSAR_LINES[Math.floor(Math.random() * COMMISSAR_LINES.length)];
}

function showBlocker() {
  if (blockerWindow || Date.now() - lastBlockAt < 60000) return;
  lastBlockAt = Date.now();
  blockerWindow = new BrowserWindow({
    fullscreen: true,
    alwaysOnTop: true,
    frame: false,
    skipTaskbar: true,
    backgroundColor: "#111827",
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  blockerWindow.setAlwaysOnTop(true, "screen-saver");
  blockerWindow.loadFile(path.join(__dirname, "renderer", "blocker.html"));
  blockerWindow.on("closed", () => { blockerWindow = null; });
  setTimeout(() => {
    if (blockerWindow && !blockerWindow.isDestroyed()) blockerWindow.close();
  }, 20000);
}

async function monitorTick() {
  if (!state.running) return;

  state.remainingSeconds = Math.max(0, Math.ceil((sessionEndsAt - Date.now()) / 1000));
  if (state.remainingSeconds === 0) {
    stopSession("本轮专注完成");
    notify("本轮完成", "做得好。先休息一下，再决定下一轮。");
    return;
  }

  const activity = await getActiveWindow();
  let result = classifyActivity(activity, state.config);
  const canUseAi = state.config.aiEnabled && process.env.OPENAI_API_KEY;
  const aiDue = Date.now() - lastAiCheckAt >= 60000;

  if (result.verdict === "unknown" && canUseAi && aiDue) {
    lastAiCheckAt = Date.now();
    try {
      result = (await classifyWithAi(activity)) || result;
    } catch (error) {
      state.status = `AI 判断暂不可用：${error.message}`;
    }
  }

  if (result.verdict === "distracted") {
    state.consecutiveDistracted += 1;
  } else if (result.verdict === "focused") {
    state.consecutiveDistracted = 0;
  } else {
    state.consecutiveDistracted = Math.max(0, state.consecutiveDistracted - 1);
  }

  state.intervention = nextIntervention(state.consecutiveDistracted);
  state.latest = { ...activity, ...result, at: new Date().toISOString() };
  state.status = result.reason;
  addHistory(state.latest);

  if (state.intervention === "nudge" && state.consecutiveDistracted === 1) {
    notify("先回来一下", `你现在的任务是：${state.task}`);
    if (state.config.voiceEnabled) void speakCommissar(randomCommissarLine());
  }
  if (state.intervention === "checkin" && state.consecutiveDistracted === 3) {
    notify("需要报到", "回到政委窗口，写下你接下来要做的一步。");
    mainWindow.show();
    mainWindow.focus();
  }
  if (state.intervention === "block") showBlocker();
  broadcast();
}

function stopSession(message = "已停止") {
  clearInterval(monitorTimer);
  monitorTimer = null;
  state = {
    ...state,
    running: false,
    remainingSeconds: 0,
    consecutiveDistracted: 0,
    intervention: "none",
    status: message
  };
  if (blockerWindow && !blockerWindow.isDestroyed()) blockerWindow.close();
  broadcast();
  return publicState();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 640,
    backgroundColor: "#f4f1e8",
    title: "AI Commissar",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

ipcMain.handle("state:get", () => publicState());
ipcMain.handle("session:start", (_, config) => {
  const durationMinutes = Math.max(5, Math.min(240, Number(config.durationMinutes) || 25));
  state = {
    ...state,
    running: true,
    task: String(config.task || "推进当前任务").trim(),
    remainingSeconds: durationMinutes * 60,
    consecutiveDistracted: 0,
    intervention: "none",
    config: {
      allowedKeywords: config.allowedKeywords || "",
      blockedKeywords: config.blockedKeywords || "",
      aiEnabled: Boolean(config.aiEnabled),
      voiceEnabled: config.voiceEnabled !== false,
      ttsVoice: ["onyx", "echo", "ash"].includes(config.ttsVoice) ? config.ttsVoice : "onyx",
      aiModel: config.aiModel || "gpt-5.4-mini"
    },
    status: "专注会话已开始",
    history: []
  };
  sessionEndsAt = Date.now() + durationMinutes * 60000;
  lastAiCheckAt = 0;
  clearInterval(monitorTimer);
  monitorTimer = setInterval(monitorTick, 5000);
  monitorTick();
  broadcast();
  return publicState();
});
ipcMain.handle("session:stop", () => stopSession("已手动停止"));
ipcMain.handle("voice:preview", async (_, voice) => {
  const selectedVoice = ["onyx", "echo", "ash"].includes(voice) ? voice : "onyx";
  const previousVoice = state.config?.ttsVoice;
  state.config = { ...(state.config || {}), ttsVoice: selectedVoice };
  void speakCommissar("同志，AI Commissar 已就位。目标一经确定，就不要把时间交给无意义的冲动。")
    .finally(() => {
      if (previousVoice) state.config.ttsVoice = previousVoice;
    });
  return { ok: true };
});
ipcMain.handle("session:checkin", (_, text) => {
  const note = String(text || "").trim();
  if (note) {
    state.consecutiveDistracted = 0;
    state.intervention = "none";
    state.status = `已报到：${note}`;
    addHistory({ at: new Date().toISOString(), verdict: "checkin", reason: note });
    broadcast();
  }
  return publicState();
});

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register("CommandOrControl+Shift+F12", () => stopSession("紧急暂停"));
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  stopSession();
  if (process.platform !== "darwin") app.quit();
});
