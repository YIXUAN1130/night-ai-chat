export default async function handler(req, res) {
  // 健康检查：GET /api/chat?ping=1
  if (req.method === "GET" && req.query.ping === "1") {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      model: "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
      hfTokenPresent: !!process.env.HF_TOKEN,
      tip: "hfTokenPresent=true 表示 Vercel 环境变量配置成功；若为 false，请到 Settings > Environment Variables 设置 HF_TOKEN。"
    });
  }

  // 限制：必须是 POST 请求
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed (GET 仅支持 ?ping=1)" });
  }

  // 取用户输入
  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  // 检查 Hugging Face Token
  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) {
    return res.status(500).json({ error: "HF_TOKEN not found in environment" });
  }

  // 使用更轻量稳定的模型
  const endpoint = "https://api-inference.huggingface.co/models/TinyLlama/TinyLlama-1.1B-Chat-v1.0";

  // 生成提示词
  const systemPrompt = "你是夜空AI，一个温柔体贴的中文聊天伙伴。请用简短、安抚的语气回复，让用户感到被理解。";
  const prompt = `${systemPrompt}\n\n用户：${message}\n夜空AI：`;

  try {
    // 调用 Hugging Face 推理接口
    const hfResp = await fetch(endpoint, {
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
      }),
    });

    const text = await hfResp.text();

    // Hugging Face 报错处理
    if (!hfResp.ok) {
      return res.status(500).json({
        error: "HF_API_ERROR",
        status: hfResp.status,
        details: text,
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: "HF_API_PARSE_ERROR", raw: text });
    }

    // 解析回复内容
    let reply = "";
    if (Array.isArray(data) && data[0]?.generated_text) {
      reply = data[0].generated_text.trim();
    } else if (typeof data === "string") {
      reply = data.trim();
    } else {
      reply = JSON.stringify(data);
    }

    // 如果模型返回空
    if (!reply) {
      reply = "✨ 我听懂了，也许你需要一点时间放松。";
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: err.message || String(err),
    });
  }
}
