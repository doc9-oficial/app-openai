import docgo from "docgo-sdk";

interface QueryParams {
  comportamento: string;
  prompt: string;
  model?: string;
  temperature?: number;
  baseUrl?: string;
}

async function query(params: QueryParams): Promise<void> {
  try {
    if (Array.isArray(params) && params.length === 1 && typeof params[0] === 'object') {
      params = params[0];
    }
    const apiKey = docgo.getEnv("OPENAI_API_KEY") || docgo.getEnv("openaiApiKey");
    if (!apiKey) {
      console.log(docgo.result(false, null, "OPENAI_API_KEY ou openaiApiKey não configurado"));
      return;
    }

    if (!params.prompt) {
      console.log(docgo.result(false, null, "É necessário informar o prompt"));
      return;
    }

    const model = params.model || docgo.getEnv("OPENAI_MODEL") || "gpt-4o-mini";
    const temperature = params.temperature ?? 0.2;

    const url =
      (params.baseUrl || docgo.getEnv("OPENAI_BASE_URL") || "https://api.openai.com").replace(
        /\/$/,
        ""
      ) + "/v1/chat/completions";

    const messages = [
      {
        role: "system",
        content: params.comportamento || "Você é um assistente útil.",
      },
      { role: "user", content: params.prompt },
    ];

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, temperature, messages }),
    } as any);

    if (!resp.ok) {
      const txt = await resp.text();
      console.log(
        docgo.result(false, null, `Falha OpenAI ${resp.status}: ${txt}`)
      );
      return;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    console.log(docgo.result(true, { model, content, usage: data.usage }));
  } catch (err: any) {
    console.log(docgo.result(false, null, err.message));
  }
}

export default query;
