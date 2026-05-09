export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
}

export class CopilotClient {
  private token: string;
  private model: string;
  private apiUrl: string;

  constructor(
    token: string,
    model: string = "gpt-4o",
    apiUrl: string = "https://models.github.ai/inference"
  ) {
    this.token = token;
    this.model = model;
    this.apiUrl = apiUrl;
  }

  buildMessages(
    systemPrompt: string,
    conversation: Omit<ChatMessage, "role" & { role: "system" }>[]
  ): ChatMessage[] {
    return [
      { role: "system", content: systemPrompt },
      ...(conversation as ChatMessage[]),
    ];
  }

  async chatCompletion(
    systemPrompt: string,
    conversation: ChatMessage[]
  ): Promise<string> {
    const messages = this.buildMessages(systemPrompt, conversation);

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Copilot API error (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Copilot API returned empty response");
    }
    return content;
  }
}
