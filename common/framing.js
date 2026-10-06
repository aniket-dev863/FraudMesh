/**
 * NDJSON stream parser.
 * Handles partial chunks across TCP boundaries.
 */
export class MessageFramer {
  constructor(onMessage, onError) {
    this.buffer = '';
    this.onMessage = onMessage;
    this.onError = onError || ((err) => console.error('[FRAMER ERROR]', err));
  }

  feed(data) {
    this.buffer += data.toString('utf-8');
    const lines = this.buffer.split('\n');
    // Keep trailing incomplete chunk
    this.buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        this.onMessage(parsed);
      } catch (err) {
        this.onError(new Error(`Malformed NDJSON message: ${trimmed.slice(0, 100)} - ${err.message}`));
      }
    }
  }

  static frame(obj) {
    return JSON.stringify(obj) + '\n';
  }
}
