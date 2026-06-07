const crypto = require("node:crypto");
const fs = require("node:fs");

const DEFAULT_EXECUTABLE = "C:\\Program Files\\Cold Turkey\\Cold Turkey Blocker.exe";

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

module.exports = {
  DEFAULT_EXECUTABLE,
  coldTurkeyAvailable,
  generateColdTurkeyPassword,
  validateBlockName
};
