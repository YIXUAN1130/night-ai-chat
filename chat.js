export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { message } = req.body;
    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Missing input message" });
    }

    const model = "shenzhi-wang/Llama3.1-8B-Chinese-Chat";

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: message,
          parameters: { max_new_tokens: 100, temperature: 0.8 },
        }),
      }
    );

    const data = await response.json();

    let reply =
      data?.[0]?.generated_text ||
      data?.generated_text ||
      "🌙 我听懂了，也许你需要一点时间放松。";

    reply = reply.replace(/^.*?：/, "").trim();
    res.status(200).json({ reply });
  } catch (error) {
    console.error("❌ Chat API Error:", error);
    res
      .status(500)
      .json({ error: "AI 模型暂时无法响应，请稍后再试 🌙" });
  }
}
