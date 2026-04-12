import { Logger } from '@nestjs/common';
import { logOpenAiTokenUsage } from '../../utils/openai-token-logger.util';

describe('logOpenAiTokenUsage', () => {
  let logger: Logger;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('Test');
    logSpy = jest.spyOn(logger, 'log').mockImplementation();
  });

  it('prompt_tokens/completion_tokens 형식의 usage를 로깅한다', () => {
    logOpenAiTokenUsage(logger, 'gpt-4o-mini', {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });

    expect(logSpy).toHaveBeenCalledWith(
      '[OpenAI token usage] model=gpt-4o-mini, prompt=100, completion=50, total=150',
    );
  });

  it('input_tokens/output_tokens 형식의 usage를 로깅한다', () => {
    logOpenAiTokenUsage(logger, 'gpt-4.1', {
      input_tokens: 200,
      output_tokens: 80,
      total_tokens: 280,
    });

    expect(logSpy).toHaveBeenCalledWith(
      '[OpenAI token usage] model=gpt-4.1, prompt=200, completion=80, total=280',
    );
  });

  it('usage가 null이면 로깅하지 않는다', () => {
    logOpenAiTokenUsage(logger, 'gpt-4o-mini', null);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('usage가 undefined이면 로깅하지 않는다', () => {
    logOpenAiTokenUsage(logger, 'gpt-4o-mini', undefined);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('total_tokens만 있으면 prompt에 total_tokens를 사용한다', () => {
    logOpenAiTokenUsage(logger, 'gpt-4o-mini', {
      total_tokens: 300,
    });

    expect(logSpy).toHaveBeenCalledWith(
      '[OpenAI token usage] model=gpt-4o-mini, prompt=300, completion=0, total=300',
    );
  });
});
