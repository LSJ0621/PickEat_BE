/**
 * Email content constants for localized email templates
 * These are NOT part of the I18n translation system - they are email-specific content
 */

import { EmailPurpose } from '../dto/send-email-code.dto';

export const EMAIL_CONTENT = {
  ko: {
    verification: {
      pageTitle: '이메일 인증',
      emailTitle: {
        [EmailPurpose.SIGNUP]: '회원가입 인증 코드',
        [EmailPurpose.RE_REGISTER]: '재가입 인증 코드',
        [EmailPurpose.RESET_PASSWORD]: '비밀번호 재설정 인증 코드',
      },
      purposeLabel: {
        [EmailPurpose.SIGNUP]: '회원가입',
        [EmailPurpose.RE_REGISTER]: '재가입',
        [EmailPurpose.RESET_PASSWORD]: '비밀번호 재설정',
      },
      description: {
        [EmailPurpose.SIGNUP]:
          'PickEat에 가입해 주셔서 감사합니다. 아래 인증 코드를 입력하여 이메일 인증을 완료해 주세요.',
        [EmailPurpose.RE_REGISTER]:
          'PickEat 재가입을 위한 인증 코드입니다. 아래 코드를 입력하여 인증을 완료해 주세요.',
        [EmailPurpose.RESET_PASSWORD]:
          '비밀번호 재설정을 위한 인증 코드입니다. 아래 코드를 입력하여 인증을 완료해 주세요.',
      },
      inputPrompt: '인증 코드는 아래와 같습니다.',
      validityMessage: '이 코드는 <b>5분 동안</b> 유효합니다.',
      securityMessage: '본인이 요청하지 않았다면 이 메일을 무시하세요.',
      ignoreMessage:
        '이 메일에 회신하지 마세요. 도움이 필요하시면 고객센터로 문의해 주세요.',
      footer: {
        [EmailPurpose.SIGNUP]: 'PickEat 팀 드림',
        [EmailPurpose.RE_REGISTER]: 'PickEat 팀 드림',
        [EmailPurpose.RESET_PASSWORD]: 'PickEat 팀 드림',
      },
    },
    welcome: {
      emailTitle: 'PickEat에 오신 것을 환영합니다!',
      pageTitle: '환영합니다',
      description:
        '회원가입이 완료되었습니다. 이제 AI 기반 맞춤형 메뉴 추천 서비스를 이용하실 수 있습니다.',
      featuresTitle: '주요 기능',
      ctaText: '지금 시작하기',
      footer: 'PickEat 팀 드림',
    },
    deactivation: {
      emailTitle: '계정 비활성화 안내',
      pageTitle: '계정 비활성화',
      description: '귀하의 계정이 비활성화되었습니다.',
      supportEmail: 'support@pickeat.com',
      dataRetentionDays: '30',
      footer: 'PickEat 팀 드림',
    },
  },
  en: {
    verification: {
      pageTitle: 'Email Verification',
      emailTitle: {
        [EmailPurpose.SIGNUP]: 'Sign Up Verification Code',
        [EmailPurpose.RE_REGISTER]: 'Re-registration Verification Code',
        [EmailPurpose.RESET_PASSWORD]: 'Password Reset Verification Code',
      },
      purposeLabel: {
        [EmailPurpose.SIGNUP]: 'Sign Up',
        [EmailPurpose.RE_REGISTER]: 'Re-registration',
        [EmailPurpose.RESET_PASSWORD]: 'Password Reset',
      },
      description: {
        [EmailPurpose.SIGNUP]:
          'Thank you for signing up for PickEat. Please enter the verification code below to complete email verification.',
        [EmailPurpose.RE_REGISTER]:
          'This is your verification code for re-registering with PickEat. Please enter the code below to complete verification.',
        [EmailPurpose.RESET_PASSWORD]:
          'This is your verification code for password reset. Please enter the code below to complete verification.',
      },
      inputPrompt: 'Your verification code is below.',
      validityMessage: 'This code is valid for <b>5 minutes</b>.',
      securityMessage: 'If you did not request this, please ignore this email.',
      ignoreMessage:
        'Do not reply to this email. If you need help, please contact customer support.',
      footer: {
        [EmailPurpose.SIGNUP]: 'PickEat Team',
        [EmailPurpose.RE_REGISTER]: 'PickEat Team',
        [EmailPurpose.RESET_PASSWORD]: 'PickEat Team',
      },
    },
    welcome: {
      emailTitle: 'Welcome to PickEat!',
      pageTitle: 'Welcome',
      description:
        'Your registration is complete. You can now use our AI-powered personalized menu recommendation service.',
      featuresTitle: 'Key Features',
      ctaText: 'Get Started',
      footer: 'PickEat Team',
    },
    deactivation: {
      emailTitle: 'Account Deactivation Notice',
      pageTitle: 'Account Deactivation',
      description: 'Your account has been deactivated.',
      supportEmail: 'support@pickeat.com',
      dataRetentionDays: '30',
      footer: 'PickEat Team',
    },
  },
} as const;
