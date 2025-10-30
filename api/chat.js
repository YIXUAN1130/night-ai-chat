// api/chat.js
const MODEL = "Qwen/Qwen2-0.5B-Instruct"; // 小而快
const HF_URL = `https://api-inference.huggingface.co/models/${MODEL}`;

export default async function handler(req, res) {
  // ① 快速自检：浏览器访问  /api/chat?ping=1  看配置是否正确
  if (req.method === "GET") {
    if (req.query?.ping) {
      return res.status(200).json({
        ok: true,
        route: "/api/chat",
        model: MODEL,
        hfTokenPresent: !!process.env.HF_TOKEN,
        tip: "hfTokenPresent=true 才算配置了环境变量 HF_TOKEN；若为 false，请到 Vercel > Settings > Environment Variables 设置。",
      });
    }
    return res.status(405).json({ error: "Method not allowed (GET not supported without ?ping=1)" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed (use POST)" });
  }

  try {
    const { message } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }
    if (!process.env.HF_TOKEN) {
      return res.status(500).json({
        error: "HF_TOKEN is missing",
        detail: "请到 Vercel 项目 Settings -> Environment Variables 新增 HF_TOKEN（huggingface 的 token，形如 hf_xxx），然后 Redeploy。",
      });
    }

    // ② 调 Hugging Face 文生文接口
    const hfResp = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 用一个很简单的指令式格式，避免过于复杂的模板导致模型困惑
        inputs: `用户：${message}\n助手：`,
        parameters: {
          max_new_tokens: 160,
          temperature: 0.8,
          // 一些后端支持该参数（返回不带 prompt 的文本），不支持也没关系
          return_full_text: false,
        },
        // 冷启动时等待模型就绪
        options: { wait_for_model: true },
      }),
    });

    // ③ 非 2xx 直接把错误回传，方便排查
    if (!hfResp.ok) {
      const errText = await hfResp.text().catch(() => "");
      return res.status(hfResp.status).json({
        error: `Hugging Face API HTTP ${hfResp.status}`,
        detail: errText,
      });
    }

    const data = await hfResp.json();

    // ④ 兼容不同返回格式，尽力抽取文本
    let reply = "🌙 夜空AI暂时没有回应。";
    if (Array.isArray(data) && data[0]) {
      if (data[0].generated_text) {
        reply = data[0].generated_text;
      } else if (data[0].text) {
        reply = data[0].text;
      }
    } else if (data && data.generated_text) {
      reply = data.generated_text;
    }

    // 如果里面包含“助手：”，把前面的 prompt 切掉
    if (reply.includes("助手：")) {
      reply = reply.split("助手：").pop().trim();
    }
    // 极端情况兜底
    if (!reply || typeof reply !== "string") {
      reply = "🌙 夜空AI暂时没有回应。";
    }

    return res.status(200).json({ reply });
  } catch (e) {
    console.error("HF Inference Call Error:", e);
    return res.status(500).json({ error: "AI服务暂时不可用", detail: String(e) });
  }
}
