import {
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from './auth.constants';

describe('Опции cookie с refresh-токеном', () => {
  it('гасящие опции повторяют выдающие во всём, кроме maxAge', () => {
    // Arrange: браузер удалит cookie, только если атрибуты совпадают
    // с теми, с которыми она была выдана.
    const { maxAge, ...issuedAttributes } = refreshCookieOptions(true);

    // Act
    const clearedAttributes = clearRefreshCookieOptions(true);

    // Assert
    expect(clearedAttributes).toEqual(issuedAttributes);
    expect(maxAge).toBeGreaterThan(0);
  });

  it('не задаёт срок жизни при гашении', () => {
    // Arrange
    // Act
    const options = clearRefreshCookieOptions(false);

    // Assert: срок жизни перебил бы дату истечения в прошлом,
    // которую выставляет clearCookie.
    expect(options).not.toHaveProperty('maxAge');
    expect(options).not.toHaveProperty('expires');
  });
});
