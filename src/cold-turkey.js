const crypto = require("node:crypto");
const fs = require("node:fs");

const DEFAULT_EXECUTABLE = "C:\\Program Files\\Cold Turkey\\Cold Turkey Blocker.exe";
const SAFE_LOCK_MINUTES = 30;

function generateColdTurkeyPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

function validateBlockName(value) {
  const name = String(value || "").trim();
  if (!name || name.length > 80 || /["\r\n]/.test(name)) {
    throw new Error("Cold Turkey block 名称无效");
  }
  return name;
}

function coldTurkeyAvailable(executablePath = DEFAULT_EXECUTABLE) {
  return fs.existsSync(executablePath);
}

function parseBlockStatus(output) {
  const status = String(output || "").trim().toLowerCase();
  if (status.includes("enabled")) return "enabled";
  if (status.includes("disabled")) return "disabled";
  return "unknown";
}

function safeTimedLockArgs(blockName, minutes = SAFE_LOCK_MINUTES) {
  const lockMinutes = Math.max(1, Math.min(SAFE_LOCK_MINUTES, Math.floor(Number(minutes) || SAFE_LOCK_MINUTES)));
  return ["-start", validateBlockName(blockName), "-lock", String(lockMinutes)];
}

module.exports = {
  DEFAULT_EXECUTABLE,
  coldTurkeyAvailable,
  generateColdTurkeyPassword,
  parseBlockStatus,
  SAFE_LOCK_MINUTES,
  safeTimedLockArgs,
  validateBlockName
};
