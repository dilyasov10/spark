import { ConfigService } from '@nestjs/config';
import { AUTH_ERROR_CODE } from '../auth.error-code';
import { GithubOAuthService } from './github-oauth.service';

describe('GithubOAuthService', () => {
  const originalFetch = global.fetch;
  let service: GithubOAuthService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new GithubOAuthService({
      getOrThrow: jest.fn((key: string) => `value-of-${key}`),
    } as unknown as ConfigService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('собирает URL авторизации GitHub со state и scope user:email', () => {
    const url = new URL(service.buildAuthorizationUrl('csrf-state'));

    expect(url.origin + url.pathname).toBe(
      'https://github.com/login/oauth/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('value-of-GITHUB_CLIENT_ID');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'value-of-GITHUB_CALLBACK_URL',
    );
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('state')).toBe('csrf-state');
  });

  it('берёт email из /user, если он публичный', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'gh-access' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          login: 'octocat',
          name: 'Иван Петров',
          email: 'octocat@example.com',
        }),
      });

    const profile = await service.fetchProfile('auth-code');

    expect(profile).toEqual({
      providerId: '42',
      email: 'octocat@example.com',
      firstName: 'Иван',
      lastName: 'Петров',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('читает /user/emails, если в /user email скрыт', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'gh-access' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 42,
          login: 'octocat',
          name: null,
          email: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            email: 'noreply@github.com',
            primary: false,
            verified: true,
          },
          {
            email: 'octocat@example.com',
            primary: true,
            verified: true,
          },
        ],
      });

    const profile = await service.fetchProfile('auth-code');

    expect(profile).toEqual({
      providerId: '42',
      email: 'octocat@example.com',
      firstName: 'octocat',
      lastName: undefined,
    });
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://api.github.com/user/emails',
    );
  });

  it('кидает OAUTH_FAILED, если GitHub вернул error вместо токена', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        error: 'bad_verification_code',
        error_description: 'The code passed is incorrect or expired.',
      }),
    });

    await expect(service.fetchProfile('bad-code')).rejects.toMatchObject({
      code: AUTH_ERROR_CODE.OAUTH_FAILED,
    });
  });
});
