// ✅ /api/chat.js — 使用 Qwen/Qwen2-0.5B-Instruct

export const config = {
  runtime: "nodejs", // 保证运行在 Node.js 环境，而非 Edge Runtime
};

const DEFAULT_MODEL = process.env.HF_MODEL || "Qwen/Qwen2-0.5B-Instruct";

export default async function handler(req, res) {
  const HF_TOKEN = process.env.HF_TOKEN;

  // 🩺 健康检查接口
  if (req.method === "GET" && req.query.ping === "1") {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      model: DEFAULT_MODEL,
      hfTokenPresent: !!HF_TOKEN,
    });
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ error: "Method not allowed (GET 仅支持 ?ping=1)" });
  }

  if (!HF_TOKEN) {
    return res
      .status(500)
      .json({ error: "HF_TOKEN not found in environment" });
  }

  const { message } = req.body || {};
  if (!message)
    return res.status(400).json({ error: "Missing message from client" });

  const endpoint = `https://api-inference.huggingface.co/models/${encodeURIComponent(
    DEFAULT_MODEL
  )}`;

  const systemPrompt =
    "你是夜空AI，一个温柔体贴的中文聊天伙伴，请用简短、安抚、自然的语气回复。";
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
          repetition_penalty: 1.05,
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

    // 如果 Hugging Face 模型正在加载或限流，自动等待重试一次
    if (out.resp.status === 503 || out.resp.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      out = await callOnce();
    }

    if (!out.resp.ok) {
      console.error("❌ HF_API_ERROR", out.resp.status, out.text);
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
      return res.status(500).json({
        error: "HF_API_PARSE_ERROR",
        raw: out.text,
      });
    }

    // 提取回复内容（兼容不同返回格式）
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
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || String(err),
    });
  }
}
