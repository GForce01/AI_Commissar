const path = require("node:path");

const GAME_LAUNCHERS = new Set([
  "steam",
  "epicgameslauncher",
  "goggalaxy",
  "galaxyclient",
  "eadesktop",
  "ealauncher",
  "origin",
  "upc",
  "ubisoftconnect",
  "battle.net",
  "battle.net launcher",
  "riotclientservices",
  "xboxpcappft",
  "gamingservicesui"
]);

const GAME_PATH_MARKERS = [
  "\\steamapps\\common\\",
  "\\xboxgames\\",
  "\\epic games\\",
  "\\gog galaxy\\games\\",
  "\\gog games\\",
  "\\ea games\\",
  "\\origin games\\",
  "\\ubisoft game launcher\\games\\",
  "\\ubisoft\\ubisoft game launcher\\games\\",
  "\\riot games\\",
  "\\battle.net\\"
];

const NON_GAME_PATH_MARKERS = [
  "\\epic games\\launcher\\",
  "\\steam\\bin\\",
  "\\steam\\package\\"
];

function normalizePath(value) {
  return String(value || "").replaceAll("/", "\\").toLowerCase();
}

function isWithinRoot(executablePath, root) {
  const executable = normalizePath(executablePath);
  const normalizedRoot = normalizePath(path.resolve(root)).replace(/\\+$/, "");
  return executable === normalizedRoot || executable.startsWith(`${normalizedRoot}\\`);
}

function detectGame(activity, installedGameRoots = [], registeredGameExecutables = []) {
  const processName = String(activity?.processName || "").toLowerCase().replace(/\.exe$/, "");
  const executablePath = normalizePath(activity?.executablePath);

  if (GAME_LAUNCHERS.has(processName)) {
    return { detected: true, reason: `游戏平台：${activity.processName}` };
  }

  if (!executablePath) return { detected: false };

  if (registeredGameExecutables.some((gamePath) => executablePath === normalizePath(gamePath))) {
    return { detected: true, reason: "Windows 已登记此程序为游戏" };
  }

  if (installedGameRoots.some((root) => isWithinRoot(executablePath, root))) {
    return { detected: true, reason: "位于已安装游戏目录" };
  }

  const hasGameMarker = GAME_PATH_MARKERS.some((marker) => executablePath.includes(marker));
  const isLauncherHelper = NON_GAME_PATH_MARKERS.some((marker) => executablePath.includes(marker));
  if (hasGameMarker && !isLauncherHelper) {
    return { detected: true, reason: "位于游戏平台游戏目录" };
  }

  return { detected: false };
}

module.exports = { detectGame, GAME_LAUNCHERS, GAME_PATH_MARKERS };
