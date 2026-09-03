import { ConfigService } from '@nestjs/config';
import { AUTH_ERROR_CODE } from '../auth.error-code';
import { GoogleOAuthService } from './google-oauth.service';

describe('GoogleOAuthService', () => {
  const originalFetch = global.fetch;
  let service: GoogleOAuthService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new GoogleOAuthService({
      getOrThrow: jest.fn((key: string) => `value-of-${key}`),
    } as unknown as ConfigService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('собирает URL авторизации Google со state и scope openid email profile', () => {
    const url = new URL(service.buildAuthorizationUrl('csrf-state'));

    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe('value-of-GOOGLE_CLIENT_ID');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'value-of-GOOGLE_CALLBACK_URL',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('csrf-state');
  });

  it('меняет code на профиль из userinfo', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'google-access' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => ({
          sub: 'google-sub-42',
          email: 'google.user@example.com',
          given_name: 'Иван',
          family_name: 'Петров',
        }),
      });

    const profile = await service.fetchProfile('auth-code');

    expect(profile).toEqual({
      providerId: 'google-sub-42',
      email: 'google.user@example.com',
      firstName: 'Иван',
      lastName: 'Петров',
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://oauth2.googleapis.com/token',
    );
    const tokenInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(tokenInit.method).toBe('POST');
    expect(String(tokenInit.body)).toContain('code=auth-code');
  });

  it('кидает OAUTH_FAILED, если Google вернул error вместо токена', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Bad Request',
      }),
    });

    await expect(service.fetchProfile('bad-code')).rejects.toMatchObject({
      code: AUTH_ERROR_CODE.OAUTH_FAILED,
    });
  });
});
