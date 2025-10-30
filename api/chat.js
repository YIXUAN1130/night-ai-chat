// api/chat.js
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
    // 初始化 Hugging Face 接口客户端
    const client = new OpenAI({
      baseURL: "https://api-inference.huggingface.co/v1",
      apiKey: process.env.HF_TOKEN, // 你在 Vercel 设置的 Hugging Face Token
    });

    // 调用 Qwen 模型（轻量、速度快）
    const chatCompletion = await client.chat.completions.create({
      model: "Qwen/Qwen1.5-0.5B-Chat",
      messages: [
        {
          role: "system",
          content: "你是夜空AI，一个温柔体贴的中文聊天伙伴。请用简洁、自然的语气回应用户。",
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const reply =
      chatCompletion.choices?.[0]?.message?.content ||
      "🌙 夜空AI暂时没有回应。";
    res.status(200).json({ reply });
  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "AI服务暂时不可用，请稍后再试 🌙" });
  }
}
