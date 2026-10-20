import { Injectable } from '@nestjs/common';
import { env } from '../../config/env.js';

/** Распознавание не настроено или не удалось — бот так и скажет, текст не выдумывается. */
export class SpeechUnavailableError extends Error {}

/**
 * Голосовое → текст. Только расшифровка: дальше текст идёт через тот же
 * детерминированный разбор, что и набранное руками сообщение, — ИИ ничего
 * не решает за человека. Прямой HTTP вместо SDK, как и в разборе входящих.
 */
@Injectable()
export class SpeechToTextService {
  private get apiKey(): string {
    return env.STT_API_KEY || env.AI_API_KEY;
  }

  private get baseUrl(): string {
    return (env.STT_BASE_URL || env.AI_BASE_URL).replace(/\/+$/, '');
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async transcribe(audio: ArrayBuffer, filename: string): Promise<string> {
    if (!this.isConfigured) throw new SpeechUnavailableError('ключ не задан');

    const form = new FormData();
    form.append('file', new Blob([audio], { type: 'audio/ogg' }), filename);
    form.append('model', env.STT_MODEL);
    form.append('language', 'ru');
    form.append('response_format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
    } catch (e) {
      throw new SpeechUnavailableError(
        controller.signal.aborted ? 'таймаут' : `сеть: ${String(e)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new SpeechUnavailableError(`HTTP ${res.status}`);

    const payload = (await res.json()) as { text?: string };
    return (payload.text ?? '').trim();
  }
}
