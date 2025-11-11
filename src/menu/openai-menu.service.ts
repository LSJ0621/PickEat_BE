import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import OpenAI from 'openai';
import {
  buildUserPrompt,
  MENU_RECOMMENDATIONS_JSON_SCHEMA,
  SYSTEM_PROMPT,
} from './prompts/menu-recommendation.prompts';

interface MenuRecommendationsResponse {
  recommendations: string[];
}

@Injectable()
export class OpenAiMenuService implements OnModuleInit {
  private readonly logger = new Logger(OpenAiMenuService.name);
  private readonly defaultModel = 'gpt-5';
  private openai: OpenAI;

  onModuleInit() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured');
      return;
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  async generateMenuRecommendations(
    prompt: string,
    tags: string[],
  ): Promise<string[]> {
    if (!this.openai) {
      throw new InternalServerErrorException(
        'OpenAI API key is not configured',
      );
    }

    const model = process.env.OPENAI_MODEL ?? this.defaultModel;

    // 프롬프트 파일에서 가져온 프롬프트 사용
    const systemPrompt = SYSTEM_PROMPT;
    const userPrompt = buildUserPrompt(prompt, tags);
    const jsonSchema = MENU_RECOMMENDATIONS_JSON_SCHEMA;

    const startedAt = Date.now();
    
    // 프롬프트 내용 로그 출력 (디버깅용)
    this.logger.log(
      `📤 [OpenAI 요청 시작] model=${model}`,
    );
    this.logger.log(
      `📋 [System Prompt]\n${systemPrompt}`,
    );
    this.logger.log(
      `📋 [User Prompt]\n${userPrompt}`,
    );
    this.logger.log(
      `📋 [JSON Schema]\n${JSON.stringify(jsonSchema, null, 2)}`,
    );
    this.logger.log(
      `📤 [OpenAI 요청] 사용자 요청: "${prompt.substring(0, 50)}..."`,
    );

    try {
      // GPT-5 모델은 temperature를 지원하지 않음
      const isGpt5 = model.startsWith('gpt-5');
      const requestParams: any = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'menu_recommendations',
            schema: jsonSchema,
            strict: true,
          },
        },
        // GPT-5는 reasoning tokens를 사용하므로 더 많은 토큰이 필요
        max_completion_tokens: isGpt5 ? 2000 : 500,
      };

      // GPT-5가 아닌 경우에만 temperature 설정
      if (!isGpt5) {
        requestParams.temperature = 0.9;
      }

      const response = await this.openai.chat.completions.create(requestParams);

      const duration = Date.now() - startedAt;
      
      // 응답 디버깅을 위한 로깅
      this.logger.log(
        `📥 [OpenAI 응답 원본] ${JSON.stringify(response, null, 2)}`,
      );
      
      const choice = response.choices[0];
      if (!choice) {
        throw new Error('OpenAI returned no choices');
      }

      const content = choice.message?.content;
      const finishReason = choice.finish_reason;

      this.logger.log(
        `📥 [OpenAI 응답 상세] finish_reason=${finishReason}, has_content=${!!content}`,
      );

      if (!content) {
        throw new Error(
          `OpenAI returned no content. finish_reason: ${finishReason}`,
        );
      }

      const parsed = JSON.parse(content) as MenuRecommendationsResponse;
      const recommendations = parsed.recommendations || [];

      if (!recommendations.length) {
        throw new Error('OpenAI returned no recommendations');
      }

      // 메뉴명 정규화 (추가 안전장치)
      const normalized = this.normalizeMenuNames(recommendations);

      this.logger.log(
        `✅ [OpenAI 응답] 소요 시간: ${duration}ms, 추천 개수: ${normalized.length}`,
      );

      return normalized;
    } catch (error) {
      const duration = Date.now() - startedAt;
      const errorMessage =
        error instanceof Error ? error.message : 'unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `❌ [OpenAI 에러] 소요 시간: ${duration}ms, 에러: ${errorMessage}`,
        errorStack,
      );

      throw new InternalServerErrorException(
        'Failed to fetch menu recommendations',
      );
    }
  }

  /**
   * 메뉴명 정규화: 영어 주석, 괄호, 불필요한 문자 제거
   */
  private normalizeMenuNames(menuNames: string[]): string[] {
    return menuNames
      .map((name) => {
        // 괄호와 그 안의 내용 제거 (예: "떡볶이 (Tteokbokki)" → "떡볶이")
        let normalized = name.replace(/\([^)]*\)/g, '').trim();

        // 영어 문자 제거
        normalized = normalized.replace(/[a-zA-Z]/g, '').trim();

        // 한글만 남기기 (공백 제거)
        normalized = normalized.replace(/\s+/g, '');

        // 한글만 허용 (글자수 제한 없음)
        const match = normalized.match(/^[가-힣]+$/);
        return match ? match[0] : null;
      })
      .filter((name): name is string => name !== null && name.length > 0)
      .filter((name, index, array) => array.indexOf(name) === index); // 중복 제거
  }
}
