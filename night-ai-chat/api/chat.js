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
      baseURL: "https://api-inference.huggingface.co/v1", // ✅ Hugging Face endpoint
      apiKey: process.env.HF_TOKEN, // ✅ 从环境变量读取 Token
    });

    const chatCompletion = await client.chat.completions.create({
      model: "shenzhi-wang/Llama3.1-8B-Chinese-Chat",
      messages: [
        {
          role: "system",
          content:
            "你是夜空AI，一个温柔细腻、懂人心的中文聊天伙伴。请使用温柔口吻，简短自然地回应用户。",
        },
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
    console.error("Chat API Error:", error);
    res.status(500).json({ error: "AI服务暂时不可用，请稍后再试 🌙" });
  }
}





