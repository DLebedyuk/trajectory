import { env } from '../../config/env.js';

/** Профиль, который нам нужен от Google. Ничего лишнего мы не запрашиваем. */
export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
  idToken: string | null;
}

/** Вход: только личность, никакого доступа к данным Google. */
export const LOGIN_SCOPES = ['openid', 'email', 'profile'];
/** Календарь запрашивается отдельным согласием и только на чтение. */
export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Обмен кода на токены вынесен за интерфейс: тесты подставляют заглушку и
 * проверяют наш сценарий, не ходя в сеть.
 */
export interface GoogleOAuthClient {
  authorizeUrl(params: {
    state: string;
    scopes: string[];
    redirectUri: string;
    /** true — просим refresh token (нужен календарю, не нужен входу). */
    offline?: boolean;
    loginHint?: string | null;
  }): string;
  exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens>;
  profileFromIdToken(idToken: string): GoogleProfile;
}

/** Разбор JWT без проверки подписи — см. комментарий в profileFromIdToken. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new Error('ID-токен Google повреждён');
  const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

export class RealGoogleOAuthClient implements GoogleOAuthClient {
  authorizeUrl(params: {
    state: string;
    scopes: string[];
    redirectUri: string;
    offline?: boolean;
    loginHint?: string | null;
  }): string {
    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scopes.join(' '));
    url.searchParams.set('state', params.state);
    url.searchParams.set('include_granted_scopes', 'true');
    if (params.offline) {
      // refresh token Google отдаёт только при offline + явном согласии
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
    } else {
      url.searchParams.set('prompt', 'select_account');
    }
    if (params.loginHint) url.searchParams.set('login_hint', params.loginHint);
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<GoogleTokens> {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      // тело ответа может содержать client_secret в эхо-параметрах — не логируем
      throw new Error(`Google отклонил обмен кода: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      id_token?: string;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
      idToken: data.id_token ?? null,
    };
  }

  /**
   * Подпись ID-токена не проверяем намеренно: токен получен нами напрямую от
   * token-эндпоинта Google по TLS в обмен на client_secret, а не принят от
   * браузера. Google для серверного потока это разрешает. Проверяем то, что
   * защищает от подмены конфигурации: издателя, аудиторию и срок.
   */
  profileFromIdToken(idToken: string): GoogleProfile {
    const p = decodeJwtPayload(idToken);
    const iss = String(p.iss ?? '');
    if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
      throw new Error('Неожиданный издатель ID-токена');
    }
    if (String(p.aud ?? '') !== env.GOOGLE_CLIENT_ID) {
      throw new Error('ID-токен выписан другому приложению');
    }
    if (Number(p.exp ?? 0) * 1000 < Date.now()) throw new Error('ID-токен истёк');
    const email = String(p.email ?? '');
    if (!email) throw new Error('Google не вернул почту');
    return {
      sub: String(p.sub),
      email,
      name: String(p.name ?? email.split('@')[0]),
      picture: p.picture ? String(p.picture) : null,
    };
  }
}

export const GOOGLE_OAUTH = Symbol('GOOGLE_OAUTH');
