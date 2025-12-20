import { HttpException } from '@nestjs/common';
import { PipelineFailedException } from '@/common/exceptions/pipeline-failed.exception';

export interface PipelineStep<C> {
  name: string;
  run: (ctx: C) => Promise<void>;
}

export interface PipelineHooks<C> {
  onStepStart?: (name: string, ctx: C) => void;
  onStepSuccess?: (name: string, ctx: C, durationMs: number) => void;
  onStepError?: (name: string, error: unknown, ctx: C) => void;
}

export async function runPipeline<C>(
  steps: PipelineStep<C>[],
  ctx: C,
  hooks?: PipelineHooks<C>,
): Promise<C> {
  for (const step of steps) {
    hooks?.onStepStart?.(step.name, ctx);
    const startedAt = Date.now();

    try {
      await step.run(ctx);
      hooks?.onStepSuccess?.(step.name, ctx, Date.now() - startedAt);
    } catch (error) {
      hooks?.onStepError?.(step.name, error, ctx);

      // HttpException은 그대로 전파하여 기존 전역 필터를 활용
      if (error instanceof HttpException) {
        throw error;
      }

      // 기타 예외는 파이프라인 예외로 래핑
      throw new PipelineFailedException(step.name, error);
    }
  }

  return ctx;
}
