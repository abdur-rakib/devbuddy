const TELEGRAM_MAX_LENGTH = 4096;

export function chunkMessage(
  text: string,
  maxLength: number = TELEGRAM_MAX_LENGTH
): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    // If a single line is too long, hard-split it
    if (line.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength));
      }
      continue;
    }

    const wouldBe = current ? current + "\n" + line : line;
    if (wouldBe.length > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = wouldBe;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

const MARKDOWN_SPECIAL = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, "\\$1");
}
