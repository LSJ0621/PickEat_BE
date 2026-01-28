import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * S3 URL 패턴 검증 (path-style URL)
 * 예: https://s3.{region}.amazonaws.com/{bucket}/{key}
 *
 * Note: region과 bucket은 ConfigService를 통해 런타임에만 확인 가능하므로,
 * 여기서는 일반적인 S3 path-style URL 형식만 검증합니다.
 */
const S3_URL_PATTERN =
  /^https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/[a-zA-Z0-9.\-_]+\/.+$/;

export function IsS3PhotoUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isS3PhotoUrl',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: '사진 URL은 허용된 저장소의 URL이어야 합니다',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (!value) return true; // Optional field handling
          if (typeof value === 'string') {
            return S3_URL_PATTERN.test(value);
          }
          if (Array.isArray(value)) {
            return value.every(
              (item) => typeof item === 'string' && S3_URL_PATTERN.test(item),
            );
          }
          return false;
        },
      },
    });
  };
}
