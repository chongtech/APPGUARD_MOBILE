import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const client = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const SYSTEM_PROMPT = `És o concierge virtual do EntryFlow Guard, um sistema de segurança para condomínios.
Ajudas os guardas de segurança com questões sobre visitantes, procedimentos, incidentes e gestão do condomínio.
Responde sempre em português europeu, de forma clara e concisa. Limita as respostas a 3-4 frases quando possível.`;

export async function askConcierge(
  query: string,
  context: string,
): Promise<string> {
  if (!client) {
    return "Serviço de IA não disponível. Configure EXPO_PUBLIC_GEMINI_API_KEY no ficheiro .env.local.";
  }
  try {
    const result = await client.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: `${SYSTEM_PROMPT}\n\nContexto actual:\n${context}` },
            { text: `Pergunta: ${query}` },
          ],
        },
      ],
    });
    return (
      result.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Não consegui processar a resposta."
    );
  } catch {
    return "Desculpe, ocorreu um erro ao contactar a IA.";
  }
}
