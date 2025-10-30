// api/chat.js - 直连 Hugging Face Inference API
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    const resp = await fetch(
      "https://api-inference.huggingface.co/models/Qwen/Qwen2-0.5B-Instruct",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: `系统：你是夜空AI，一个温柔体贴、善解人意的中文聊天伙伴。\n用户：${message}\n夜空AI：`,
          options: { wait_for_model: true }
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      console.error("HF Inference Error:", err);
      return res.status(500).json({ error: "HF 调用失败", detail: err });
    }

    const data = await resp.json();
    const reply =
      Array.isArray(data) && data[0]?.generated_text
        ? data[0].generated_text.split("夜空AI：").pop().trim()
        : "🌙 夜空AI暂时没有回应。";

    res.status(200).json({ reply });
  } catch (error) {
    console.error("HF Inference Call Error:", error);
    res.status(500).json({ error: "AI服务暂时不可用，请稍后再试 🌙" });
  }
}

}

