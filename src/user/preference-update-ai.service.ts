import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import OpenAI from 'openai';
import {
  buildPreferenceUserPrompt,
  PREFERENCE_RESPONSE_SCHEMA,
  PREFERENCE_SYSTEM_PROMPT,
} from './prompts/preference-update.prompts';
import { UserPreferences } from './interfaces/user-preferences.interface';

interface PreferenceAnalysisResponse {
  analysis: string;
}

@Injectable()
export class PreferenceUpdateAiService implements OnModuleInit {
  private readonly logger = new Logger(PreferenceUpdateAiService.name);
  private openai: OpenAI | null = null;
  private readonly model =
    process.env.OPENAI_MODEL ||
    (process.env.OPENAI_GPT_VERSION === '5' ? 'gpt-5o-mini' : 'gpt-4o-mini');

  onModuleInit() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      return;
    }
    this.openai = new OpenAI({ apiKey });
  }

  async generatePreferenceAnalysis(
    current: UserPreferences,
    slotMenus: {
      breakfast: string[];
      lunch: string[];
      dinner: string[];
      etc: string[];
    },
  ): Promise<PreferenceAnalysisResponse> {
    if (!this.openai) {
      throw new InternalServerErrorException('OpenAI client is not configured');
    }

    const system = PREFERENCE_SYSTEM_PROMPT;
    const user = buildPreferenceUserPrompt({
      currentLikes: current.likes ?? [],
      currentDislikes: current.dislikes ?? [],
      currentAnalysis: current.analysis,
      slotMenus,
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }
      
      this.logger.debug(`[LLM 응답] ${content}`);
      
      let parsed: PreferenceAnalysisResponse;
      try {
        parsed = JSON.parse(content) as PreferenceAnalysisResponse;
      } catch (parseError) {
        this.logger.error(`[JSON 파싱 실패] ${content}`);
        throw new Error(`Failed to parse JSON: ${parseError instanceof Error ? parseError.message : 'unknown error'}`);
      }
      
      this.validateSchema(parsed);
      return {
        analysis: parsed.analysis.trim(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`❌ [Preference LLM 실패] ${message}`);
      throw new InternalServerErrorException('Failed to update preferences via LLM');
    }
  }

  private validateSchema(data: PreferenceAnalysisResponse) {
    if (!data) {
      this.logger.error(`[스키마 검증 실패] data is null or undefined`);
      throw new Error('Invalid response schema: data is null or undefined');
    }
    if (typeof data.analysis !== 'string') {
      this.logger.error(`[스키마 검증 실패] analysis type is ${typeof data.analysis}, value: ${JSON.stringify(data.analysis)}`);
      throw new Error(`Invalid response schema: analysis is not a string (type: ${typeof data.analysis})`);
    }
    if (!data.analysis.trim()) {
      this.logger.error(`[스키마 검증 실패] analysis is empty string`);
      throw new Error('Invalid response schema: analysis is empty');
    }
  }
}
