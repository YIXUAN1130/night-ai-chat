const DEFAULT_MODEL = process.env.HF_MODEL || "TinyLlama/TinyLlama-1.1B-Chat-v1.0";

export default async function handler(req, res) {
  // ---- 入口日志 ----
  console.log("▶️ /api/chat invoked");
  console.log("💡 HF_TOKEN:", process.env.HF_TOKEN ? "✅ exists" : "❌ missing");
  console.log("🧠 Model:", DEFAULT_MODEL);
  console.log("🔹 Method:", req.method, "Query:", req.query);

  // 健康检查
  if (req.method === "GET" && req.query.ping === "1") {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      model: DEFAULT_MODEL,
      hfTokenPresent: !!process.env.HF_TOKEN,
      tip: "hfTokenPresent=true 才算配置了环境变量 HF_TOKEN；若为 false，请到 Vercel > Settings > Environment Variables 设置。",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed (GET 仅支持 ?ping=1)" });
  }

  const { message } = req.body || {};
  console.log("✉️ Incoming message:", message);
  if (!message) return res.status(400).json({ error: "Missing message" });

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) {
    console.log("❌ HF_TOKEN missing at runtime!");
    return res.status(500).json({ error: "HF_TOKEN not found in environment" });
  }

  const endpoint = `https://api-inference.huggingface.co/models/${encodeURIComponent(DEFAULT_MODEL)}`;
  const systemPrompt =
    "你是夜空AI，一个温柔体贴的中文聊天伙伴。请用简短、安抚的语气回复，让用户感到被理解。";
  const prompt = `${systemPrompt}\n\n用户：${message}\n夜空AI：`;

  async function callOnce(tag = "1st") {
    console.log(`🚀 [${tag}] Sending HF request ->`, endpoint);
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
    }).catch((e) => {
      console.error(`❌ [${tag}] HF fetch threw before response:`, e);
      throw e;
    });

    const text = await resp.text();
    console.log(`📥 [${tag}] HF status=${resp.status}, len=${text?.length}`);
    return { resp, text };
  }

  try {
    let out = await callOnce("1st");

    // 典型：503（模型加载中）/429（限流），等待后重试一次
    if (out.resp.status === 503 || out.resp.status === 429) {
      console.log(`⏳ HF returned ${out.resp.status}, retrying after 1.5s...`);
      await new Promise((r) => setTimeout(r, 1500));
      out = await callOnce("2nd");
    }

    if (!out.resp.ok) {
      console.warn("⚠️ HF_API_ERROR:", out.resp.status, out.text?.slice(0, 500));
      return res.status(500).json({
        error: "HF_API_ERROR",
        status: out.resp.status,
        details: out.text, // 回给前端，方便你在页面看到原始报错
      });
    }

    // 解析
    let data;
    try {
      data = JSON.parse(out.text);
    } catch {
      console.warn("⚠️ HF_API_PARSE_ERROR, raw:", out.text?.slice(0, 500));
      return res.status(500).json({ error: "HF_API_PARSE_ERROR", raw: out.text });
    }

    // 兼容不同返回形态（数组/对象/字符串）
    let reply = "";
    if (Array.isArray(data) && data[0]?.generated_text) {
      reply = data[0].generated_text;
    } else if (typeof data === "string") {
      reply = data;
    } else if (data?.generated_text) {
      reply = data.generated_text;
    } else if (Array.isArray(data) && data[0]?.generated_text === "") {
      reply = ""; // 空字符串也允许
    } else {
      // 有些模型返回 { error: "..."} / { estimated_time: ... } 等
      console.log("ℹ️ Unrecognized shape:", data);
      reply = typeof data === "object" ? JSON.stringify(data) : String(data);
    }

    reply = (reply || "").trim();
    if (!reply) reply = "✨ 我听懂了，也许你需要一点时间放松。";

    console.log("✅ Final reply:", reply.slice(0, 120));
    return res.status(200).json({ reply });
  } catch (err) {
    console.error("💥 SERVER_ERROR:", err);
    return res.status(500).json({ error: "SERVER_ERROR", message: err.message || String(err) });
  }
}


