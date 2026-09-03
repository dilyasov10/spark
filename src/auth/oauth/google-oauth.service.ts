import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OAuthProfile } from '../types/oauth-profile';
import { fetchJson, oauthFailed } from './oauth-http';

const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_SCOPE = 'openid email profile';

interface GoogleTokenSuccess {
  access_token: string;
}

interface GoogleTokenError {
  error: string;
}

interface GoogleUserinfo {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Обмен authorization code Google на профиль. Passport не используем:
 * ручной code flow без зависимости от arity стратегии.
 */
@Injectable()
export class GoogleOAuthService {
  constructor(private readonly configService: ConfigService) {}

  /** URL, на который редиректим браузер в начале OAuth. */
  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      redirect_uri: this.configService.getOrThrow<string>(
        'GOOGLE_CALLBACK_URL',
      ),
      response_type: 'code',
      scope: GOOGLE_SCOPE,
      state,
      access_type: 'online',
      include_granted_scopes: 'true',
    });

    return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
  }

  async fetchProfile(code: string): Promise<OAuthProfile> {
    const token = await this.exchangeCode(code);
    const info = await this.fetchUserinfo(token.access_token);

    return {
      providerId: info.sub,
      email: info.email,
      firstName: info.given_name,
      lastName: info.family_name,
    };
  }

  private async exchangeCode(code: string): Promise<GoogleTokenSuccess> {
    const body = new URLSearchParams({
      code,
      client_id: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      client_secret: this.configService.getOrThrow<string>(
        'GOOGLE_CLIENT_SECRET',
      ),
      redirect_uri: this.configService.getOrThrow<string>(
        'GOOGLE_CALLBACK_URL',
      ),
      grant_type: 'authorization_code',
    });

    const json = await fetchJson(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (isGoogleTokenError(json) || !isGoogleTokenSuccess(json)) {
      throw oauthFailed();
    }

    return json;
  }

  private async fetchUserinfo(accessToken: string): Promise<GoogleUserinfo> {
    const json = await fetchJson(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!isGoogleUserinfo(json)) {
      throw oauthFailed();
    }

    return json;
  }
}

function isGoogleTokenError(value: unknown): value is GoogleTokenError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  );
}

function isGoogleTokenSuccess(value: unknown): value is GoogleTokenSuccess {
  return (
    typeof value === 'object' &&
    value !== null &&
    'access_token' in value &&
    typeof value.access_token === 'string'
  );
}

function isGoogleUserinfo(value: unknown): value is GoogleUserinfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sub' in value &&
    typeof value.sub === 'string'
  );
}
