const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("commissar", {
  getState: () => ipcRenderer.invoke("state:get"),
  start: (config) => ipcRenderer.invoke("session:start", config),
  stop: () => ipcRenderer.invoke("session:stop"),
  checkIn: (text) => ipcRenderer.invoke("session:checkin", text),
  previewVoice: (voice) => ipcRenderer.invoke("voice:preview", voice),
  onState: (callback) => ipcRenderer.on("state:update", (_, state) => callback(state))
});
