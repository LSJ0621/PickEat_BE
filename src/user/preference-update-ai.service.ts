import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import OpenAI from 'openai';
import { UserPreferences } from './interfaces/user-preferences.interface';
import {
  buildPreferenceUserPrompt,
  PREFERENCE_RESPONSE_SCHEMA,
  PREFERENCE_SYSTEM_PROMPT,
} from './prompts/preference-update.prompts';

interface PreferenceAnalysisResponse {
  analysis: string;
}

@Injectable()
export class PreferenceUpdateAiService implements OnModuleInit {
  private readonly logger = new Logger(PreferenceUpdateAiService.name);
  private openai: OpenAI | null = null;
    /**
     * 취향 분석 전용 모델
     * - 기본: OpenAI 최신 모델 가이드에서 권장하는 GPT-5.1 기본 모델 사용
     *   (예: requirements.md에서 GPT-5 기본 모델로 `gpt-5`를 사용하는 것과 동일한 패턴)
     * - 우선순위:
     *   1) OPENAI_PREFERENCE_MODEL (취향 분석 전용으로 명시)
     *   2) OPENAI_MODEL (글로벌 기본 모델)
     *   3) 기본값: 'gpt-5.1'
     *
     * 실제 계정에서 사용 가능한 정확한 모델명은 OpenAI 대시보드/문서를 참고해
     * 환경변수(특히 OPENAI_PREFERENCE_MODEL)에 설정하는 것을 권장.
     */
    private readonly model =
      process.env.OPENAI_PREFERENCE_MODEL ||
      process.env.OPENAI_MODEL ||
      'gpt-5.1';

  onModuleInit() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      return;
    }
      this.openai = new OpenAI({ apiKey });
      this.logger.log(`✅ Preference LLM 초기화 완료. model=${this.model}`);
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
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'preference_analysis',
            schema: PREFERENCE_RESPONSE_SCHEMA,
            strict: true,
          },
        },
        // GPT-5.1 계열: temperature 미사용, completion 토큰만 지정
        max_completion_tokens: 500,
      });
      
      const usage: any = (response as any).usage;
      if (usage) {
        const promptTokens =
          usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
        const completionTokens =
          usage.completion_tokens ?? usage.output_tokens ?? 0;
        const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
        this.logger.log(
          `📊 [Preference LLM 토큰 사용량] model=${this.model}, prompt=${promptTokens}, completion=${completionTokens}, total=${totalTokens}`,
        );
      }

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
