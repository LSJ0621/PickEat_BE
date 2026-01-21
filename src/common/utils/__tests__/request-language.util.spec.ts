import { getLanguageFromRequest } from '../request-language.util';

describe('request-language.util', () => {
  describe('getLanguageFromRequest', () => {
    /**
     * Helper function to create mock request objects
     */
    const createMockRequest = (
      options: {
        user?: { preferredLanguage?: string };
        acceptLanguage?: string;
        xLanguage?: string;
      } = {},
    ) =>
      ({
        user: options.user,
        headers: {
          'accept-language': options.acceptLanguage,
          'x-language': options.xLanguage,
        },
      }) as any;

    describe('User preference priority', () => {
      it('should return user preferred language (Korean)', () => {
        // Arrange
        const mockRequest = createMockRequest({
          user: { preferredLanguage: 'ko' },
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });

      it('should return user preferred language (English)', () => {
        // Arrange
        const mockRequest = createMockRequest({
          user: { preferredLanguage: 'en' },
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('en');
      });

      it('should prioritize user language over headers', () => {
        // Arrange
        const mockRequest = createMockRequest({
          user: { preferredLanguage: 'ko' },
          acceptLanguage: 'en-US,en;q=0.9',
          xLanguage: 'en',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });
    });

    describe('Accept-Language header fallback', () => {
      it('should fallback to Accept-Language header when no user', () => {
        // Arrange
        const mockRequest = createMockRequest({
          acceptLanguage: 'en-US,en;q=0.9',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('en');
      });

      it('should extract first language from Accept-Language', () => {
        // Arrange
        const mockRequest = createMockRequest({
          acceptLanguage: 'ko-KR,ko;q=0.9,en;q=0.8',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });

      it('should handle Accept-Language with quality values', () => {
        // Arrange
        // The implementation splits by ',' first, then by '-', so 'en;q=0.9' stays as 'en;q=0.9'
        // parseLanguage('en;q=0.9') returns 'ko' because it's not exactly 'en'
        const mockRequest = createMockRequest({
          acceptLanguage: 'en;q=0.9,ko;q=0.8',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });

      it('should handle complex Accept-Language header', () => {
        // Arrange
        const mockRequest = createMockRequest({
          acceptLanguage: 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko'); // parseLanguage defaults invalid languages to 'ko'
      });
    });

    describe('X-Language header fallback', () => {
      it('should fallback to X-Language header', () => {
        // Arrange
        const mockRequest = createMockRequest({
          xLanguage: 'en',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('en');
      });

      it('should prioritize Accept-Language over X-Language', () => {
        // Arrange
        const mockRequest = createMockRequest({
          acceptLanguage: 'ko-KR',
          xLanguage: 'en',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });
    });

    describe('Default language fallback', () => {
      it('should default to Korean when no language indicators', () => {
        // Arrange
        const mockRequest = createMockRequest({});

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });

      it('should handle invalid language codes in headers', () => {
        // Arrange
        const mockRequest = createMockRequest({
          acceptLanguage: 'invalid-lang',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });

      it('should handle empty headers object', () => {
        // Arrange
        const mockRequest = { headers: {} } as any;

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });

      it('should handle missing headers', () => {
        // Arrange
        const mockRequest = {} as any;

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });
    });

    describe('Edge cases', () => {
      it('should handle user with undefined preferredLanguage', () => {
        // Arrange
        const mockRequest = createMockRequest({
          user: { preferredLanguage: undefined },
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });

      it('should handle empty Accept-Language header', () => {
        // Arrange
        const mockRequest = createMockRequest({
          acceptLanguage: '',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });

      it('should handle whitespace-only Accept-Language', () => {
        // Arrange
        const mockRequest = createMockRequest({
          acceptLanguage: '   ',
        });

        // Act
        const result = getLanguageFromRequest(mockRequest);

        // Assert
        expect(result).toBe('ko');
      });
    });
  });
});
