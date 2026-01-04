import { HttpException, HttpStatus } from '@nestjs/common';
import { PipelineFailedException } from '../exceptions/pipeline-failed.exception';
import { PipelineHooks, PipelineStep, runPipeline } from './pipeline';

describe('Pipeline', () => {
  interface TestContext {
    value: number;
    data?: string;
    error?: string;
  }

  describe('runPipeline', () => {
    it('should execute all steps successfully', async () => {
      // Arrange
      const step1: PipelineStep<TestContext> = {
        name: 'Step 1',
        run: async (ctx) => {
          ctx.value = 10;
        },
      };

      const step2: PipelineStep<TestContext> = {
        name: 'Step 2',
        run: async (ctx) => {
          ctx.value += 5;
        },
      };

      const step3: PipelineStep<TestContext> = {
        name: 'Step 3',
        run: async (ctx) => {
          ctx.data = 'completed';
        },
      };

      const context: TestContext = { value: 0 };

      // Act
      const result = await runPipeline([step1, step2, step3], context);

      // Assert
      expect(result.value).toBe(15);
      expect(result.data).toBe('completed');
    });

    it('should call onStepStart hook for each step', async () => {
      // Arrange
      const onStepStart = jest.fn();
      const steps: PipelineStep<TestContext>[] = [
        { name: 'Step 1', run: async () => {} },
        { name: 'Step 2', run: async () => {} },
      ];
      const context: TestContext = { value: 0 };

      // Act
      await runPipeline(steps, context, { onStepStart });

      // Assert
      expect(onStepStart).toHaveBeenCalledTimes(2);
      expect(onStepStart).toHaveBeenNthCalledWith(1, 'Step 1', context);
      expect(onStepStart).toHaveBeenNthCalledWith(2, 'Step 2', context);
    });

    it('should call onStepSuccess hook for successful steps', async () => {
      // Arrange
      const onStepSuccess = jest.fn();
      const steps: PipelineStep<TestContext>[] = [
        { name: 'Step 1', run: async () => {} },
        { name: 'Step 2', run: async () => {} },
      ];
      const context: TestContext = { value: 0 };

      // Act
      await runPipeline(steps, context, { onStepSuccess });

      // Assert
      expect(onStepSuccess).toHaveBeenCalledTimes(2);
      expect(onStepSuccess).toHaveBeenNthCalledWith(
        1,
        'Step 1',
        context,
        expect.any(Number),
      );
      expect(onStepSuccess).toHaveBeenNthCalledWith(
        2,
        'Step 2',
        context,
        expect.any(Number),
      );
    });

    it('should measure step duration accurately', async () => {
      // Arrange
      const onStepSuccess = jest.fn();
      const delayMs = 50;
      const step: PipelineStep<TestContext> = {
        name: 'Delayed Step',
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        },
      };
      const context: TestContext = { value: 0 };

      // Act
      await runPipeline([step], context, { onStepSuccess });

      // Assert
      expect(onStepSuccess).toHaveBeenCalled();
      const duration = onStepSuccess.mock.calls[0][2];
      expect(duration).toBeGreaterThanOrEqual(delayMs);
    });

    it('should propagate HttpException without wrapping', async () => {
      // Arrange
      const httpError = new HttpException(
        'Bad Request',
        HttpStatus.BAD_REQUEST,
      );
      const step: PipelineStep<TestContext> = {
        name: 'Error Step',
        run: async () => {
          throw httpError;
        },
      };
      const context: TestContext = { value: 0 };

      // Act & Assert
      await expect(runPipeline([step], context)).rejects.toThrow(httpError);
      await expect(runPipeline([step], context)).rejects.toThrow(HttpException);
    });

    it('should wrap non-HttpException errors in PipelineFailedException', async () => {
      // Arrange
      const genericError = new Error('Generic error');
      const step: PipelineStep<TestContext> = {
        name: 'Error Step',
        run: async () => {
          throw genericError;
        },
      };
      const context: TestContext = { value: 0 };

      // Act & Assert
      await expect(runPipeline([step], context)).rejects.toThrow(
        PipelineFailedException,
      );
    });

    it('should call onStepError hook when step fails', async () => {
      // Arrange
      const onStepError = jest.fn();
      const error = new Error('Step failed');
      const step: PipelineStep<TestContext> = {
        name: 'Failing Step',
        run: async () => {
          throw error;
        },
      };
      const context: TestContext = { value: 0 };

      // Act
      try {
        await runPipeline([step], context, { onStepError });
      } catch (e) {
        // Expected error
      }

      // Assert
      expect(onStepError).toHaveBeenCalledWith('Failing Step', error, context);
    });

    it('should stop execution on first error', async () => {
      // Arrange
      const step1: PipelineStep<TestContext> = {
        name: 'Step 1',
        run: async (ctx) => {
          ctx.value = 10;
        },
      };

      const step2: PipelineStep<TestContext> = {
        name: 'Step 2',
        run: async () => {
          throw new Error('Step 2 failed');
        },
      };

      const step3: PipelineStep<TestContext> = {
        name: 'Step 3',
        run: async (ctx) => {
          ctx.value = 99; // Should not execute
        },
      };

      const context: TestContext = { value: 0 };

      // Act
      try {
        await runPipeline([step1, step2, step3], context);
      } catch (e) {
        // Expected error
      }

      // Assert
      expect(context.value).toBe(10); // Only step1 executed
    });

    it('should handle empty step array', async () => {
      // Arrange
      const context: TestContext = { value: 5 };

      // Act
      const result = await runPipeline([], context);

      // Assert
      expect(result).toEqual(context);
      expect(result.value).toBe(5);
    });

    it('should preserve context modifications across steps', async () => {
      // Arrange
      const step1: PipelineStep<TestContext> = {
        name: 'Step 1',
        run: async (ctx) => {
          ctx.value = 10;
          ctx.data = 'initial';
        },
      };

      const step2: PipelineStep<TestContext> = {
        name: 'Step 2',
        run: async (ctx) => {
          ctx.value *= 2;
          ctx.data += ' modified';
        },
      };

      const context: TestContext = { value: 0 };

      // Act
      const result = await runPipeline([step1, step2], context);

      // Assert
      expect(result.value).toBe(20);
      expect(result.data).toBe('initial modified');
    });

    it('should call all hooks in correct order', async () => {
      // Arrange
      const callOrder: string[] = [];
      const hooks: PipelineHooks<TestContext> = {
        onStepStart: (name) => callOrder.push(`start:${name}`),
        onStepSuccess: (name) => callOrder.push(`success:${name}`),
        onStepError: (name) => callOrder.push(`error:${name}`),
      };

      const steps: PipelineStep<TestContext>[] = [
        {
          name: 'Step 1',
          run: async () => {
            callOrder.push('run:Step 1');
          },
        },
        {
          name: 'Step 2',
          run: async () => {
            callOrder.push('run:Step 2');
          },
        },
      ];

      const context: TestContext = { value: 0 };

      // Act
      await runPipeline(steps, context, hooks);

      // Assert
      expect(callOrder).toEqual([
        'start:Step 1',
        'run:Step 1',
        'success:Step 1',
        'start:Step 2',
        'run:Step 2',
        'success:Step 2',
      ]);
    });

    it('should work with optional hooks', async () => {
      // Arrange
      const step: PipelineStep<TestContext> = {
        name: 'Step 1',
        run: async (ctx) => {
          ctx.value = 42;
        },
      };
      const context: TestContext = { value: 0 };

      // Act
      const result = await runPipeline([step], context, {});

      // Assert
      expect(result.value).toBe(42);
    });

    it('should handle async errors correctly', async () => {
      // Arrange
      const step: PipelineStep<TestContext> = {
        name: 'Async Error',
        run: async () => {
          await new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Async error')), 10);
          });
        },
      };
      const context: TestContext = { value: 0 };

      // Act & Assert
      await expect(runPipeline([step], context)).rejects.toThrow(
        PipelineFailedException,
      );
    });

    it('should include step name in PipelineFailedException', async () => {
      // Arrange
      const stepName = 'Critical Step';
      const step: PipelineStep<TestContext> = {
        name: stepName,
        run: async () => {
          throw new Error('Something went wrong');
        },
      };
      const context: TestContext = { value: 0 };

      // Act & Assert
      try {
        await runPipeline([step], context);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(PipelineFailedException);
        if (error instanceof PipelineFailedException) {
          expect(error.message).toContain(stepName);
        }
      }
    });

    it('should handle synchronous throws in step.run', async () => {
      // Arrange
      const step: PipelineStep<TestContext> = {
        name: 'Sync Throw',
        run: async () => {
          throw new HttpException(
            'Sync error',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        },
      };
      const context: TestContext = { value: 0 };

      // Act & Assert
      await expect(runPipeline([step], context)).rejects.toThrow(HttpException);
    });
  });
});
