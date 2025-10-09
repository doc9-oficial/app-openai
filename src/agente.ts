import docgo from "docgo-sdk";

interface AgenteParams {
  tarefa: string;
  app?: string;
  func?: string;
  args?: any[];
  model?: string;
  baseUrl?: string;
}

async function agente(params: AgenteParams): Promise<void> {
  try {
    if (Array.isArray(params) && params.length === 1 && typeof params[0] === 'object') {
      params = params[0];
    }
    
    // Validação de entrada
    if (!params.tarefa) {
      console.log(docgo.result(false, null, "É necessário informar a tarefa"));
      return;
    }

    const apiKey = docgo.getEnv("OPENAI_API_KEY") || docgo.getEnv("openaiApiKey");
    if (!apiKey) {
      console.log(docgo.result(false, null, "OPENAI_API_KEY ou openaiApiKey não configurado"));
      return;
    }

    const model = params.model || docgo.getEnv("OPENAI_MODEL") || "gpt-4o-mini";

    // Se o usuário já especificou app/func/args, executa diretamente via MCP
    if (params.app && params.func) {
      const res = await (docgo as any).callApp(
        params.app,
        params.func,
        params.args || []
      );
      console.log(
        docgo.result(true, {
          step: "executado",
          app: params.app,
          func: params.func,
          output: res,
        })
      );
      return;
    }

    // Caso contrário, pede ao modelo para planejar qual tool usar
    const baseUrl = params.baseUrl || docgo.getEnv("OPENAI_BASE_URL") || "https://api.openai.com";
    const url = baseUrl.replace(/\/$/, "") + "/v1/chat/completions";

    console.log(`Fazendo requisição para: ${url}`); // Debug

    const system = `Você é um agente que decide qual ferramenta utilizar via MCP dentro do DocGo.
Responda apenas JSON no formato: {"app":"nome","func":"nome","args":[...]} sem comentários.`;

    const requestBody = {
      model,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Tarefa: ${params.tarefa}` },
      ],
    };

    // Adicionar timeout e melhor tratamento de erro
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const txt = await resp.text();
        console.log(
          docgo.result(false, null, `Falha OpenAI ${resp.status}: ${txt}`)
        );
        return;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content ?? "{}";

      let plan: { app: string; func: string; args?: any[] };
      try {
        // Limpar possível markdown do conteúdo
        const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
        plan = JSON.parse(cleanContent);
      } catch (e) {
        console.log(docgo.result(false, null, `Resposta inválida do modelo: ${content}`));
        return;
      }

      if (!plan.app || !plan.func) {
        console.log(
          docgo.result(false, null, `Plano inválido retornado pelo modelo: ${JSON.stringify(plan)}`)
        );
        return;
      }

      // Executa via MCP
      const output = await (docgo as any).callApp(
        plan.app,
        plan.func,
        plan.args || []
      );
      console.log(docgo.result(true, { step: "executado", plan, output }));

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.log(docgo.result(false, null, "Timeout na requisição para OpenAI"));
      } else {
        console.log(docgo.result(false, null, `Erro de rede: ${fetchError.message}`));
      }
      return;
    }

  } catch (err: any) {
    console.log(docgo.result(false, null, `Erro geral: ${err.message}`));
  }
}

export default agente;