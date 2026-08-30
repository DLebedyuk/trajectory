import { env } from '../../config/env.js';

/** Календарь у провайдера. */
export interface RemoteCalendar {
  externalId: string;
  name: string;
  primary: boolean;
}

/** Событие у провайдера, уже приведённое к нашему виду. */
export interface RemoteEvent {
  externalId: string;
  calendarExternalId: string;
  title: string;
  /** YYYY-MM-DD в таймзоне пользователя. */
  date: string;
  /** HH:MM в таймзоне пользователя; для события на весь день — '00:00'. */
  time: string;
  duration: string | null;
  allDay: boolean;
}

/** Google перестал принимать наш токен: доступ отозван или истёк. */
export class GoogleAccessRevokedError extends Error {
  constructor(message = 'Google больше не принимает доступ к календарю') {
    super(message);
  }
}

/**
 * Обращения к Google вынесены за интерфейс: тесты подставляют заглушку и
 * проверяют разбор, склейку и защиту от дублей, не ходя в сеть.
 */
export interface GoogleCalendarApi {
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>;
  listCalendars(accessToken: string): Promise<RemoteCalendar[]>;
  listEvents(
    accessToken: string,
    calendarExternalId: string,
    range: { from: Date; to: Date },
    timezone: string,
  ): Promise<RemoteEvent[]>;
  revoke(refreshToken: string): Promise<void>;
}

export const GOOGLE_CALENDAR_API = Symbol('GOOGLE_CALENDAR_API');

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';

/** «1 ч 30 мин» — читаемая длительность вместо голых минут. */
function humanDuration(minutes: number): string | null {
  if (minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  return `${m} мин`;
}

/** Дата и время момента в таймзоне пользователя, а не сервера. */
function inTimezone(iso: string, timezone: string): { date: string; time: string } {
  const at = new Date(iso);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  return { date, time };
}

export class RealGoogleCalendarApi implements GoogleCalendarApi {
  async refreshAccessToken(refreshToken: string) {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (res.status === 400 || res.status === 401) {
      // именно так Google отвечает на отозванный или просроченный refresh-токен
      throw new GoogleAccessRevokedError();
    }
    if (!res.ok) throw new Error(`Google не обновил токен: HTTP ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  private async get<T>(accessToken: string, url: string): Promise<T> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 401 || res.status === 403) throw new GoogleAccessRevokedError();
    if (!res.ok) throw new Error(`Google Calendar ответил HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async listCalendars(accessToken: string): Promise<RemoteCalendar[]> {
    const data = await this.get<{
      items?: { id: string; summary: string; primary?: boolean; deleted?: boolean }[];
    }>(accessToken, `${API}/users/me/calendarList?maxResults=250`);
    return (data.items ?? [])
      .filter((c) => !c.deleted)
      .map((c) => ({ externalId: c.id, name: c.summary || c.id, primary: Boolean(c.primary) }));
  }

  async listEvents(
    accessToken: string,
    calendarExternalId: string,
    range: { from: Date; to: Date },
    timezone: string,
  ): Promise<RemoteEvent[]> {
    const url = new URL(`${API}/calendars/${encodeURIComponent(calendarExternalId)}/events`);
    url.searchParams.set('timeMin', range.from.toISOString());
    url.searchParams.set('timeMax', range.to.toISOString());
    // разворачиваем повторяющиеся события в отдельные вхождения
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');

    const data = await this.get<{
      items?: {
        id: string;
        status?: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }[];
    }>(accessToken, url.toString());

    const events: RemoteEvent[] = [];
    for (const item of data.items ?? []) {
      if (item.status === 'cancelled') continue;
      const startIso = item.start?.dateTime;
      const startDate = item.start?.date;
      if (!startIso && !startDate) continue;

      if (startDate) {
        events.push({
          externalId: item.id,
          calendarExternalId,
          title: item.summary ?? 'Без названия',
          date: startDate,
          time: '00:00',
          duration: null,
          allDay: true,
        });
        continue;
      }

      const { date, time } = inTimezone(startIso as string, timezone);
      const endIso = item.end?.dateTime;
      const minutes = endIso
        ? Math.round((new Date(endIso).getTime() - new Date(startIso as string).getTime()) / 60000)
        : 0;
      events.push({
        externalId: item.id,
        calendarExternalId,
        title: item.summary ?? 'Без названия',
        date,
        time,
        duration: humanDuration(minutes),
        allDay: false,
      });
    }
    return events;
  }

  async revoke(refreshToken: string): Promise<void> {
    // отзыв на стороне Google: после отключения токен не должен оставаться живым
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: refreshToken }),
    }).catch(() => undefined);
  }
}
