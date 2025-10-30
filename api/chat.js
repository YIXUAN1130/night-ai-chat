// ✅ /api/chat.js

export const config = {
  runtime: "nodejs", // 让 Vercel 使用 Node.js 环境
};

const DEFAULT_MODEL = process.env.HF_MODEL || "TinyLlama/TinyLlama-1.1B-Chat-v0.6";

export default async function handler(req, res) {
  const HF_TOKEN = process.env.HF_TOKEN;

  // 健康检查
  if (req.method === "GET" && req.query.ping === "1") {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      model: DEFAULT_MODEL,
      hfTokenPresent: !!HF_TOKEN,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed (GET 仅支持 ?ping=1)" });
  }

  if (!HF_TOKEN) {
    return res.status(500).json({ error: "HF_TOKEN not found in environment" });
  }

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "Missing message" });

  const endpoint = `https://api-inference.huggingface.co/models/${encodeURIComponent(DEFAULT_MODEL)}`;
  const systemPrompt = "你是夜空AI，一个温柔体贴的中文聊天伙伴，请用简短安抚的语气回复。";
  const prompt = `${systemPrompt}\n\n用户：${message}\n夜空AI：`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 150,
          temperature: 0.8,
          top_p: 0.95,
          return_full_text: false,
        },
        options: { wait_for_model: true, use_cache: true },
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("❌ HF API ERROR:", response.status, text);
      return res.status(500).json({
        error: "HF_API_ERROR",
        status: response.status,
        details: text,
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: "PARSE_ERROR", raw: text });
    }

    let reply = "";
    if (Array.isArray(data) && data[0]?.generated_text) {
      reply = data[0].generated_text.trim();
    } else if (typeof data === "string") {
      reply = data.trim();
    }

    if (!reply) reply = "✨ 我听懂了，也许你需要一点时间放松。";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: err.message });
  }
}
