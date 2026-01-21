import { registerDecorator, ValidationOptions } from 'class-validator';

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function IsLanguage(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLanguage',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: `${propertyName} must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'string' &&
            SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)
          );
        },
      },
    });
  };
}
