import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OPENAI_CONFIG } from '@/external/openai/openai.constants';

export abstract class BaseOpenAiService implements OnModuleInit {
  protected readonly logger: Logger;
  protected openai: OpenAI | null = null;
  protected readonly model: string;

  constructor(
    protected readonly config: ConfigService,
    loggerContext: string,
    modelEnvKey: string = 'OPENAI_MODEL',
  ) {
    this.logger = new Logger(loggerContext);
    this.model =
      this.config.get<string>(modelEnvKey) ||
      this.config.get<string>('OPENAI_MODEL') ||
      OPENAI_CONFIG.DEFAULT_MODEL;
  }

  onModuleInit() {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      return;
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }
}
