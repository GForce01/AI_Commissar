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
  const choice = payload.choices?.[0] || payload.output?.choices?.[0] || {};
  const message = choice.message || choice.delta || {};
  const content = message.content ?? choice.text ?? payload.output?.text ?? payload.text;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item?.text === "string") return item.text;
      if (typeof item?.content === "string") return item.content;
      if (typeof item?.output_text === "string") return item.output_text;
      return "";
    }).join("");
    if (text.trim()) return text;
  }
  if (typeof message.reasoning_content === "string") return message.reasoning_content;
  return "";
}

function summarizeCompatibleResponse(payload = {}) {
  const summary = JSON.stringify(payload, (_key, value) => {
    if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}...` : value;
    return value;
  });
  return String(summary || "").slice(0, 800);
}

function completionTokenBody(maxOutputTokens, parameter = "max_completion_tokens") {
  const tokens = Math.max(1, Number(maxOutputTokens) || 120);
  return { [parameter]: tokens };
}

function isQwenCompatibleRequest(baseUrl, model) {
  const text = `${baseUrl || ""} ${model || ""}`.toLowerCase();
  return text.includes("dashscope")
    || text.includes("aliyuncs.com")
    || text.includes("qwen")
    || text.includes("千问")
    || text.includes("通义");
}

function qwenThinkingBody(baseUrl, model) {
  return isQwenCompatibleRequest(baseUrl, model)
    ? { extra_body: { enable_thinking: false } }
    : {};
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
  isQwenCompatibleRequest,
  qwenThinkingBody,
  summarizeCompatibleResponse,
  normalizeApiBaseUrl
};
