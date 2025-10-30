// api/chat.js
// ✅ 修正模型名为 TinyLlama/TinyLlama-1.1B-Chat-v0.6
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
      tip: "若 hfTokenPresent 为 false，请在 Vercel > Settings > Environment Variables 中设置 HF_TOKEN。",
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

  const systemPrompt =
    "你是夜空AI，一个温柔体贴的中文聊天伙伴。请用简短、安抚的语气回复，让用户感到被理解。";
  const prompt = `${systemPrompt}\n\n用户：${message}\n夜空AI：`;

  async function callOnce() {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 180,
          temperature: 0.8,
          top_p: 0.95,
          return_full_text: false,
        },
        options: { wait_for_model: true, use_cache: true },
      }),
    });
    const text = await resp.text();
    return { resp, text };
  }

  try {
    let out = await callOnce();

    // 再试一次（模型加载或限流时）
    if (out.resp.status === 503 || out.resp.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      out = await callOnce();
    }

    if (!out.resp.ok) {
      return res.status(500).json({
        error: "HF_API_ERROR",
        status: out.resp.status,
        details: out.text,
      });
    }

    let data;
    try {
      data = JSON.parse(out.text);
    } catch {
      return res.status(500).json({ error: "HF_API_PARSE_ERROR", raw: out.text });
    }

    let reply = "";
    if (Array.isArray(data) && data[0]?.generated_text) {
      reply = data[0].generated_text.trim();
    } else if (typeof data === "string") {
      reply = data.trim();
    } else if (data?.generated_text) {
      reply = (data.generated_text || "").trim();
    } else {
      reply = JSON.stringify(data);
    }

    if (!reply) reply = "✨ 我听懂了，也许你需要一点时间放松。";
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("SERVER_ERROR:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: err.message || String(err) });
  }
}

