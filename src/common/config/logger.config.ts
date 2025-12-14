import { Params } from 'nestjs-pino';

export const loggerConfig: Params = {
  pinoHttp: {
    // 민감한 정보 마스킹
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    // 로그 내용 간소화
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    // 특정 경로 로그 억제
    autoLogging: {
      ignore: (req) => req.url === '/metrics',
    },
    // 개발환경: 가독성 좋은 포맷
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
};
