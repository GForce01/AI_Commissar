const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";

function normalizeApiBaseUrl(value) {
  const raw = String(value || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
  let url;
  try {
    url = new URL(raw);
  } catch {
    return DEFAULT_API_BASE_URL;
  }
  if (!["http:", "https:"].includes(url.protocol)) return DEFAULT_API_BASE_URL;
  return url.toString().replace(/\/+$/, "");
}

function compatibleEndpoint(baseUrl, pathname) {
  return `${normalizeApiBaseUrl(baseUrl)}/${String(pathname || "").replace(/^\/+/, "")}`;
}

function extractChatCompletionText(payload = {}) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || item?.content || "").join("");
  }
  return "";
}

function completionTokenBody(maxOutputTokens, parameter = "max_completion_tokens") {
  const tokens = Math.max(1, Number(maxOutputTokens) || 120);
  return { [parameter]: tokens };
}

function alternateTokenParameter(errorText, currentParameter) {
  const text = String(errorText || "").toLowerCase();
  if (currentParameter === "max_completion_tokens"
    && text.includes("max_completion_tokens")
    && (text.includes("unsupported") || text.includes("unknown"))) {
    return "max_tokens";
  }
  if (currentParameter === "max_tokens"
    && text.includes("max_tokens")
    && (text.includes("unsupported") || text.includes("use 'max_completion_tokens'"))) {
    return "max_completion_tokens";
  }
  return "";
}

module.exports = {
  DEFAULT_API_BASE_URL,
  alternateTokenParameter,
  completionTokenBody,
  compatibleEndpoint,
  extractChatCompletionText,
  normalizeApiBaseUrl
};
