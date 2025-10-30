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
    const client = new OpenAI({
      baseURL: "https://api-inference.huggingface.co/v1",
      apiKey: process.env.HF_TOKEN, // Hugging Face Token（在 Vercel 环境变量中配置）
    });

    const chatCompletion = await client.chat.completions.create({
      model: "Qwen/Qwen1.5-0.5B-Chat", // ✅ 已替换为更小更快的模型
      messages: [
        {
          role: "system",
          content: "你是夜空AI，一个温柔体贴的中文聊天伙伴。",
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const reply = chatCompletion.choices?.[0]?.message?.content || "🌙 夜空AI暂时没有回应。";
    res.status(200).json({ reply });
  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "AI服务暂时不可用，请稍后再试 🌙" });
  }
}





