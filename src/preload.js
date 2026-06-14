const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("commissar", {
  getState: () => ipcRenderer.invoke("state:get"),
  openWinterSupervision: () => ipcRenderer.invoke("external:winter-supervision:open"),
  start: (config) => ipcRenderer.invoke("session:start", config),
  startEntertainment: (config) => ipcRenderer.invoke("entertainment:start", config),
  stopEntertainment: () => ipcRenderer.invoke("entertainment:stop"),
  startEntertainmentGuard: (blockName) => ipcRenderer.invoke("entertainment:guard:start", blockName),
  requestStop: (evidence) => ipcRenderer.invoke("session:stop:request", evidence),
  forceStop: () => ipcRenderer.invoke("session:stop:force"),
  checkIn: (text) => ipcRenderer.invoke("session:checkin", text),
  previewVoice: (options) => ipcRenderer.invoke("voice:preview", options),
  savePersonality: (prompt) => ipcRenderer.invoke("settings:personality:save", prompt),
  savePreferences: (preferences) => ipcRenderer.invoke("settings:preferences:save", preferences),
  saveCompatibleApiKey: (apiKey) => ipcRenderer.invoke("settings:api-key:save", apiKey),
  generateDailyPlan: (sourceTasks) => ipcRenderer.invoke("daily-plan:generate", sourceTasks),
  completeDailyPlanItem: (itemId, evidence) => ipcRenderer.invoke("daily-plan:complete", itemId, evidence),
  resetPersonality: () => ipcRenderer.invoke("settings:personality:reset"),
  recoverColdTurkey: () => ipcRenderer.invoke("cold-turkey:recover"),
  confirmColdTurkeyUnlocked: () => ipcRenderer.invoke("cold-turkey:confirm-unlocked"),
  revealPreviousColdTurkeyPassword: () => ipcRenderer.invoke("cold-turkey:reveal-previous"),
  onState: (callback) => ipcRenderer.on("state:update", (_, state) => callback(state))
});
