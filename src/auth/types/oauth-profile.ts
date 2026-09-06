/** Значение колонки `OAuthProvider.provider`. */
export type OAuthProviderName = 'google' | 'github';

/**
 * Нормализованный профиль после обмена authorization code (Google / GitHub).
 * Email может отсутствовать, если пользователь не дал scope или почта скрыта.
 */
export interface OAuthProfile {
  /** Id у провайдера — пишется в `OAuthProvider.providerId`. */
  providerId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}
