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
      baseURL: "https://router.huggingface.co/v1",
      apiKey: process.env.HF_TOKEN, // 这里填 Hugging Face 的 Token（在 Vercel 设置环境变量）
    });

    const chatCompletion = await client.chat.completions.create({
      model: "shenzhi-wang/Llama3.1-8B-Chinese-Chat:featherless-ai",
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const reply = chatCompletion.choices[0]?.message?.content || "🌙 夜空AI暂时没有回应。";
    res.status(200).json({ reply });
  } catch (error) {
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "AI服务暂时不可用，请稍后再试 🌙" });
  }
}


