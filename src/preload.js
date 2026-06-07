const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("commissar", {
  getState: () => ipcRenderer.invoke("state:get"),
  start: (config) => ipcRenderer.invoke("session:start", config),
  requestStop: (evidence) => ipcRenderer.invoke("session:stop:request", evidence),
  forceStop: () => ipcRenderer.invoke("session:stop:force"),
  checkIn: (text) => ipcRenderer.invoke("session:checkin", text),
  previewVoice: (voice) => ipcRenderer.invoke("voice:preview", voice),
  savePersonality: (prompt) => ipcRenderer.invoke("settings:personality:save", prompt),
  resetPersonality: () => ipcRenderer.invoke("settings:personality:reset"),
  recoverColdTurkey: () => ipcRenderer.invoke("cold-turkey:recover"),
  onState: (callback) => ipcRenderer.on("state:update", (_, state) => callback(state))
});
