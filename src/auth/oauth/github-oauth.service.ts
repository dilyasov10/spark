import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthProfile } from '../types/oauth-profile';
import { fetchJson, oauthFailed } from './oauth-http';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';
const GITHUB_SCOPE = 'read:user user:email';
const GITHUB_ACCEPT = 'application/vnd.github+json';
const GITHUB_USER_AGENT = 'inctagram-oauth';

interface GithubTokenSuccess {
  access_token: string;
}

interface GithubTokenError {
  error: string;
}

interface GithubUser {
  id: number;
  name?: string | null;
  email?: string | null;
  login: string;
}

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Обмен authorization code GitHub на профиль. Email часто скрыт в `/user` —
 * тогда читаем `/user/emails` и берём primary verified.
 */
@Injectable()
export class GithubOAuthService {
  constructor(private readonly configService: ConfigService) {}

  /** URL, на который редиректим браузер в начале OAuth. */
  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>('GITHUB_CLIENT_ID'),
      redirect_uri: this.configService.getOrThrow<string>(
        'GITHUB_CALLBACK_URL',
      ),
      scope: GITHUB_SCOPE,
      state,
    });

    return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
  }

  async fetchProfile(code: string): Promise<OAuthProfile> {
    const token = await this.exchangeCode(code);
    const user = await this.fetchUser(token.access_token);
    const email =
      user.email ?? (await this.fetchPrimaryEmail(token.access_token));
    const names = splitGithubName(user.name, user.login);

    return {
      providerId: String(user.id),
      email,
      firstName: names.firstName,
      lastName: names.lastName,
    };
  }

  private async exchangeCode(code: string): Promise<GithubTokenSuccess> {
    const json = await fetchJson(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.configService.getOrThrow<string>('GITHUB_CLIENT_ID'),
        client_secret: this.configService.getOrThrow<string>(
          'GITHUB_CLIENT_SECRET',
        ),
        code,
        redirect_uri: this.configService.getOrThrow<string>(
          'GITHUB_CALLBACK_URL',
        ),
      }),
    });

    if (isGithubTokenError(json) || !isGithubTokenSuccess(json)) {
      throw oauthFailed();
    }

    return json;
  }

  private async fetchUser(accessToken: string): Promise<GithubUser> {
    const json = await fetchJson(GITHUB_USER_URL, {
      headers: githubApiHeaders(accessToken),
    });

    if (!isGithubUser(json)) {
      throw oauthFailed();
    }

    return json;
  }

  /**
   * Имя из GitHub не обязательно: при ошибке API отдаём пустые поля,
   * а `AuthService` подставит заглушки. Email — обязателен для создания User.
   */
  private async fetchPrimaryEmail(
    accessToken: string,
  ): Promise<string | undefined> {
    try {
      const json = await fetchJson(GITHUB_EMAILS_URL, {
        headers: githubApiHeaders(accessToken),
      });
      if (!Array.isArray(json)) {
        return undefined;
      }

      const emails = json.filter(isGithubEmail);
      const primaryVerified = emails.find(
        (item) => item.primary && item.verified,
      );
      const anyVerified = emails.find((item) => item.verified);

      return primaryVerified?.email ?? anyVerified?.email ?? emails[0]?.email;
    } catch {
      return undefined;
    }
  }
}

function githubApiHeaders(accessToken: string): HeadersInit {
  return {
    Accept: GITHUB_ACCEPT,
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': GITHUB_USER_AGENT,
  };
}

function splitGithubName(
  name: string | null | undefined,
  login: string,
): { firstName?: string; lastName?: string } {
  const trimmed = name?.trim();
  if (!trimmed) {
    return { firstName: login };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function isGithubTokenError(value: unknown): value is GithubTokenError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  );
}

function isGithubTokenSuccess(value: unknown): value is GithubTokenSuccess {
  return (
    typeof value === 'object' &&
    value !== null &&
    'access_token' in value &&
    typeof value.access_token === 'string'
  );
}

function isGithubUser(value: unknown): value is GithubUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number' &&
    'login' in value &&
    typeof value.login === 'string'
  );
}

function isGithubEmail(value: unknown): value is GithubEmail {
  return (
    typeof value === 'object' &&
    value !== null &&
    'email' in value &&
    typeof value.email === 'string' &&
    'primary' in value &&
    typeof value.primary === 'boolean' &&
    'verified' in value &&
    typeof value.verified === 'boolean'
  );
}
