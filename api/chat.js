// api/chat.js   （如果你用的是 api/聊天.js，文件名和前端 fetch 路径要一致）
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    const client = new OpenAI({
      // ✅ 必须是这个入口：HF 的 OpenAI 兼容 API
      baseURL: "https://api-inference.huggingface.co/v1",
      apiKey: process.env.HF_TOKEN, // 在 Vercel 环境变量设置
    });

    const chatCompletion = await client.chat.completions.create({
      // ✅ 使用兼容模型，避免 404
      model: "Qwen/Qwen2-0.5B-Instruct",
      messages: [
        { role: "system", content: "你是夜空AI，一个温柔体贴、善解人意的中文聊天伙伴。" },
        { role: "user", content: message },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const reply =
      chatCompletion.choices?.[0]?.message?.content ||
      "🌙 夜空AI暂时没有回应。";
    res.status(200).json({ reply });
  } catch (error) {
    // 打印 HF 返回的详细错误，便于你在 Runtime Logs 里看到真实原因
    console.error("Chat API Error:", error?.response?.data || error?.message || error);
    res.status(500).json({
      error: "AI服务暂时不可用，请稍后再试 🌙",
      detail: error?.response?.data || error?.message || String(error),
    });
  }
}
