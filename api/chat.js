// api/chat.js —— 直接调用 Hugging Face Inference API（非 OpenAI 兼容）
export default async function handler(req, res) {
  // 诊断用：/api/chat?ping=1
  if (req.query.ping) {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      mode: "inference",
      model: "Qwen/Qwen2-0.5B-Instruct",
      hfTokenPresent: !!process.env.HF_TOKEN,
      tip: "若 hfTokenPresent=false 才需去 Vercel > Settings > Environment Variables 配置 HF_TOKEN",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = {};
  try {
    body = req.body || {};
  } catch (e) {}
  const { message } = body;

  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    const endpoint =
      "https://api-inference.huggingface.co/models/Qwen/Qwen2-0.5B-Instruct";

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json",
        // 可选：避免缓存 & 冷启动稳定一些
        "x-use-cache": "false",
      },
      body: JSON.stringify({
        inputs: message,
        parameters: {
          max_new_tokens: 160,
          temperature: 0.7,
          top_p: 0.9,
          // 只返回新增的生成部分
          return_full_text: false,
        },
        options: {
          wait_for_model: true, // 首次会“唤醒”模型，可能慢 10~20s
          use_cache: false,
        },
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({
        error: "HF_API_ERROR",
        status: r.status,
        details: text?.slice(0, 400) || "no details",
      });
    }

    const data = await r.json();

    // HF 返回格式可能是：
    // 1) [{ generated_text: "..." }]
    // 2) { generated_text: "..." }
    // 3) 其他任务结构（兜底）
    let reply = "";
    if (Array.isArray(data) && data[0]?.generated_text) {
      reply = data[0].generated_text;
    } else if (data?.generated_text) {
      reply = data.generated_text;
    } else if (Array.isArray(data) && data[0]?.content) {
      reply = data[0].content;
    } else {
      // 兜底，便于调试
      reply = typeof data === "string" ? data : JSON.stringify(data).slice(0, 200);
    }

    // 简单清洗（可选）
    reply = (reply || "").trim();
    if (!reply) reply = "✨ 我听见了，也会一直在。";

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({
      error: "SERVER_ERROR",
      details: String(err),
    });
  }
}

