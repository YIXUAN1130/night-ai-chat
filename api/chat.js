const DEFAULT_MODEL = process.env.HF_MODEL || "TinyLlama/TinyLlama-1.1B-Chat-v1.0";

export default async function handler(req, res) {
  console.log("💡 HF_TOKEN:", process.env.HF_TOKEN ? "✅ exists" : "❌ missing");
  console.log("🧠 Model:", DEFAULT_MODEL);

  if (req.method === "GET" && req.query.ping === "1") {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      model: DEFAULT_MODEL,
      hfTokenPresent: !!process.env.HF_TOKEN,
    });
  }


  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed (GET 仅支持 ?ping=1)" });
  }

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "Missing message" });

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return res.status(500).json({ error: "HF_TOKEN not found in environment" });

  const endpoint = `https://api-inference.huggingface.co/models/${encodeURIComponent(DEFAULT_MODEL)}`;
  const systemPrompt =
    "你是夜空AI，一个温柔体贴的中文聊天伙伴。请用简短、安抚的语气回复，让用户感到被理解。";
  const prompt = `${systemPrompt}\n\n用户：${message}\n夜空AI：`;

  // 简单重试（模型加载/限流）
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
        // 关键：等待模型加载，避免 503
        options: { wait_for_model: true, use_cache: true },
      }),
    });
    const text = await resp.text();
    return { resp, text };
  }

  try {
    let out = await callOnce();

    // 对典型错误做一次重试
    if (out.resp.status === 503 || out.resp.status === 429) {
      await new Promise(r => setTimeout(r, 1500));
      out = await callOnce();
    }

    if (!out.resp.ok) {
      return res.status(500).json({
        error: "HF_API_ERROR",
        status: out.resp.status,
        details: out.text, // 把 HF 的原始返回体给前端，便于定位
      });
    }

    // 尝试解析
    let data;
    try {
      data = JSON.parse(out.text);
    } catch {
      return res.status(500).json({ error: "HF_API_PARSE_ERROR", raw: out.text });
    }

    // 兼容不同返回形态
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

