/**
 * Convert markdown to Telegram-supported HTML.
 * Telegram supports: <b>, <i>, <code>, <pre>, <a>, <s>, <u>, <blockquote>
 */
export function markdownToTelegramHTML(text: string): string {
  let result = text;

  // Escape HTML entities first (but preserve existing tags)
  result = result
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (```lang\n...\n```)
  result = result.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre>${code.trim()}</pre>`;
  });

  // Inline code (`...`)
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold (**...**)
  result = result.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

  // Italic (*...*)
  result = result.replace(/\*([^*]+)\*/g, "<i>$1</i>");

  // Strikethrough (~~...~~)
  result = result.replace(/~~([^~]+)~~/g, "<s>$1</s>");

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes (> ...)
  result = result.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // Headers (## ... → bold)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

  return result;
}

/**
 * Truncate text to Telegram's message limit (4096 chars).
 */
export function truncateForTelegram(text: string, limit = 4000): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 3) + "...";
}
