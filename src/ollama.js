const OLLAMA_BASE_URL = "http://127.0.0.1:11434";

async function getOllamaStatus(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}`);
    const data = await response.json();
    return {
      available: true,
      models: (data.models || []).map((item) => ({
        name: item.name,
        family: item.details?.family || "",
        families: item.details?.families || []
      }))
    };
  } catch (error) {
    return { available: false, models: [], error: error.message };
  }
}

function hasModel(status, modelName) {
  const requested = String(modelName || "").toLowerCase();
  return Boolean(status?.models?.some((item) => {
    const installed = String(item.name || "").toLowerCase();
    return installed === requested
      || installed === `${requested}:latest`
      || requested === installed.replace(/:latest$/, "");
  }));
}

async function ollamaChat({ model, prompt, imageBase64, format, fetchImpl = fetch }) {
  const message = { role: "user", content: prompt };
  if (imageBase64) message.images = [imageBase64];
  const response = await fetchImpl(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [message],
      stream: false,
      think: false,
      format,
      keep_alive: "10m",
      options: { temperature: format ? 0 : 0.6 }
    }),
    signal: AbortSignal.timeout(imageBase64 ? 120000 : 60000)
  });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  const data = await response.json();
  return String(data.message?.content || "").trim();
}

module.exports = { OLLAMA_BASE_URL, getOllamaStatus, hasModel, ollamaChat };
