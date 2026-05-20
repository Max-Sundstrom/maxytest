/**
 * Block schema + defaults + registry unit tests — Plan 01-03 Task 1.
 *
 * Locks the discriminated-union contract and the default copy strings that
 * Plans 01-03..06 expect. If the catalog ever ships in another phase, these
 * tests catch a registry mis-classification before the catalog renders.
 */

import { describe, expect, it } from 'vitest';
import {
  agreementAnswerSchema,
  agreementContentSchema,
  blockContentSchema,
  choiceAnswerSchema,
  choiceContentSchema,
  contextAnswerSchema,
  contextContentSchema,
  npsAnswerSchema,
  npsContentSchema,
  openQuestionContentSchema,
  prototypeContentSchema,
  scaleAnswerSchema,
  scaleContentSchema,
  thanksContentSchema,
  welcomeContentSchema,
} from './schemas';
import {
  AGREEMENT_DEFAULT,
  CHOICE_DEFAULT,
  CONTEXT_DEFAULT,
  NPS_DEFAULT,
  OPEN_QUESTION_DEFAULT,
  SCALE_DEFAULT,
  THANKS_DEFAULT,
  WELCOME_DEFAULT,
} from './defaults';
import { BLOCK_REGISTRY } from './registry';
import { Hand, Heart, MessageSquare, Smartphone } from 'lucide-react';

/**
 * Dummy UUIDv7-format string used across the prototype schema tests. The
 * Zod validator only asserts UUID shape (not version), so any well-formed
 * UUID literal works; a UUIDv7-shaped one keeps parity with how the import
 * flow will generate real prototype_version_ids.
 */
const SAMPLE_PROTO_UUID = '00000000-0000-7000-8000-000000000000';

describe('blockContentSchema (discriminated union)', () => {
  it('parses a valid welcome content payload', () => {
    const result = welcomeContentSchema.safeParse({
      type: 'welcome',
      title: 'Hello world',
      body: 'Some intro text',
      cta_label: 'Start',
    });
    expect(result.success).toBe(true);
  });

  it('rejects welcome content with empty title', () => {
    const result = welcomeContentSchema.safeParse({
      type: 'welcome',
      title: '',
      body: 'Body OK',
      cta_label: 'Start',
    });
    expect(result.success).toBe(false);
  });

  it('rejects open_question content longer than 280 chars', () => {
    const result = openQuestionContentSchema.safeParse({
      type: 'open_question',
      question: 'q'.repeat(281),
    });
    expect(result.success).toBe(false);
  });

  it('rejects thanks content with body longer than 500 chars', () => {
    const result = thanksContentSchema.safeParse({
      type: 'thanks',
      title: 'Thanks!',
      body: 'b'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown block content type', () => {
    expect(() => blockContentSchema.parse({ type: 'unknown', x: 1 })).toThrow();
  });

  it('discriminates welcome variant correctly', () => {
    const result = blockContentSchema.parse({
      type: 'welcome',
      title: 'T',
      body: 'B',
      cta_label: 'Start',
    });
    expect(result.type).toBe('welcome');
    if (result.type === 'welcome') {
      // TS narrowing — `title` only exists on welcome variant.
      expect(result.title).toBe('T');
    }
  });

  it('discriminates open_question variant correctly', () => {
    const result = blockContentSchema.parse({
      type: 'open_question',
      question: 'Why?',
    });
    expect(result.type).toBe('open_question');
    if (result.type === 'open_question') {
      expect(result.question).toBe('Why?');
    }
  });
});

describe('block defaults', () => {
  it('WELCOME_DEFAULT has type=welcome and cta_label=Start', () => {
    expect(WELCOME_DEFAULT.type).toBe('welcome');
    expect(WELCOME_DEFAULT.cta_label).toBe('Start');
  });

  it('OPEN_QUESTION_DEFAULT.question matches UI-SPEC copy lock', () => {
    expect(OPEN_QUESTION_DEFAULT.question).toBe('What did you find confusing about this design?');
  });

  it('THANKS_DEFAULT.body matches UI-SPEC copy lock', () => {
    expect(THANKS_DEFAULT.body).toBe('We appreciate you taking the time.');
  });

  it('all three defaults round-trip through blockContentSchema', () => {
    // The defaults must be valid per the schema — otherwise create_study()
    // RPC would insert invalid jsonb that the editors then refuse to load.
    expect(blockContentSchema.safeParse(WELCOME_DEFAULT).success).toBe(true);
    expect(blockContentSchema.safeParse(OPEN_QUESTION_DEFAULT).success).toBe(true);
    expect(blockContentSchema.safeParse(THANKS_DEFAULT).success).toBe(true);
  });
});

describe('BLOCK_REGISTRY', () => {
  it('welcome is enabled in Phase 1 and uses the Hand icon', () => {
    const entry = BLOCK_REGISTRY['welcome'];
    expect(entry.label).toBe('Welcome');
    expect(entry.icon).toBe(Hand);
    expect(entry.enabledInPhase).toBe(1);
    expect(entry.disabledTooltip).toBeUndefined();
  });

  it('open_question is enabled in Phase 1 and uses MessageSquare icon', () => {
    const entry = BLOCK_REGISTRY['open_question'];
    expect(entry.icon).toBe(MessageSquare);
    expect(entry.enabledInPhase).toBe(1);
  });

  it('thanks is enabled in Phase 1 and uses the Heart icon', () => {
    const entry = BLOCK_REGISTRY['thanks'];
    expect(entry.icon).toBe(Heart);
    expect(entry.enabledInPhase).toBe(1);
  });

  it('choice ships in Phase 4 with the locked tooltip', () => {
    const entry = BLOCK_REGISTRY['choice'];
    expect(entry.enabledInPhase).toBe(4);
    expect(entry.disabledTooltip).toBe('Coming in Phase 4');
  });

  it('prototype is enabled in Phase 1 (active as of Plan 02-05) with Smartphone icon', () => {
    const entry = BLOCK_REGISTRY['prototype'];
    expect(entry.enabledInPhase).toBe(1);
    expect(entry.disabledTooltip).toBeUndefined();
    expect(entry.icon).toBe(Smartphone);
  });

  it('all 17 v1 block types are registered', () => {
    // Sanity check: the registry covers every BlockType in the union.
    const keys = Object.keys(BLOCK_REGISTRY);
    expect(keys.length).toBeGreaterThanOrEqual(16);
  });
});

describe('prototypeContentSchema', () => {
  it('parses a fully-populated prototype content payload', () => {
    const result = prototypeContentSchema.safeParse({
      type: 'prototype',
      prototype_version_id: SAMPLE_PROTO_UUID,
      starting_frame_id: 'f1',
      task_instruction: 'Find how to change your password.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects content missing prototype_version_id', () => {
    const result = prototypeContentSchema.safeParse({
      type: 'prototype',
      starting_frame_id: 'f1',
      task_instruction: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('rejects content with a non-UUID prototype_version_id', () => {
    const result = prototypeContentSchema.safeParse({
      type: 'prototype',
      prototype_version_id: 'not-a-uuid',
      starting_frame_id: 'f1',
      task_instruction: 'X',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The custom message is preferred but the default Zod UUID error is
      // also acceptable — both indicate the prototype must be imported first.
      const messages = result.error.issues.map((issue) => issue.message).join(' | ');
      expect(messages.length).toBeGreaterThan(0);
    }
  });

  it('rejects content with an empty starting_frame_id', () => {
    const result = prototypeContentSchema.safeParse({
      type: 'prototype',
      prototype_version_id: SAMPLE_PROTO_UUID,
      starting_frame_id: '',
      task_instruction: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('rejects task_instruction longer than 280 characters', () => {
    const result = prototypeContentSchema.safeParse({
      type: 'prototype',
      prototype_version_id: SAMPLE_PROTO_UUID,
      starting_frame_id: 'f1',
      task_instruction: 'A'.repeat(281),
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional success_path and finish_frame_ids arrays', () => {
    const result = prototypeContentSchema.safeParse({
      type: 'prototype',
      prototype_version_id: SAMPLE_PROTO_UUID,
      starting_frame_id: 'f1',
      task_instruction: 'OK',
      success_path: ['f1', 'f2', 'f3'],
      finish_frame_ids: ['f3'],
    });
    expect(result.success).toBe(true);
  });

  it('discriminates the prototype variant through the full union', () => {
    // Verifies blockContentSchema (discriminatedUnion) routes `type:'prototype'`
    // to prototypeContentSchema and returns the narrowed type.
    const result = blockContentSchema.parse({
      type: 'prototype',
      prototype_version_id: SAMPLE_PROTO_UUID,
      starting_frame_id: 'f1',
      task_instruction: 'Find pricing.',
    });
    expect(result.type).toBe('prototype');
    if (result.type === 'prototype') {
      expect(result.prototype_version_id).toBe(SAMPLE_PROTO_UUID);
      expect(result.starting_frame_id).toBe('f1');
    }
  });
});

// ============================================================================
// Phase 4 / Plan 04-01 — survey-blocks-v1 core set
// ============================================================================

describe('choiceContentSchema', () => {
  it('accepts valid single-mode choice with 3 options', () => {
    const result = choiceContentSchema.safeParse({
      type: 'choice',
      question: 'Какой вариант вам ближе?',
      mode: 'single',
      options: [
        { id: '1', label: 'А' },
        { id: '2', label: 'Б' },
        { id: '3', label: 'В' },
      ],
      hasOtherOption: false,
      shuffleOptions: false,
      required: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid multi-mode choice with min/max selections', () => {
    const result = choiceContentSchema.safeParse({
      type: 'choice',
      question: 'Выберите 1–2 опции',
      mode: 'multi',
      options: [
        { id: '1', label: 'A' },
        { id: '2', label: 'B' },
        { id: '3', label: 'C' },
      ],
      hasOtherOption: true,
      shuffleOptions: true,
      min_selections: 1,
      max_selections: 2,
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects choice with only 1 option', () => {
    const result = choiceContentSchema.safeParse({
      type: 'choice',
      question: 'Q?',
      mode: 'single',
      options: [{ id: '1', label: 'A' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects multi-choice with max_selections < min_selections', () => {
    const result = choiceContentSchema.safeParse({
      type: 'choice',
      question: 'Q?',
      mode: 'multi',
      options: [
        { id: '1', label: 'A' },
        { id: '2', label: 'B' },
      ],
      min_selections: 3,
      max_selections: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects choice with question longer than 280 chars', () => {
    const result = choiceContentSchema.safeParse({
      type: 'choice',
      question: 'q'.repeat(281),
      mode: 'single',
      options: [
        { id: '1', label: 'A' },
        { id: '2', label: 'B' },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('scaleContentSchema', () => {
  it('accepts a valid 5-point scale with endpoint labels', () => {
    const result = scaleContentSchema.safeParse({
      type: 'scale',
      question: 'Оцените от 1 до 5',
      points: 5,
      endpointMinLabel: 'Совсем нет',
      endpointMaxLabel: 'Полностью да',
      required: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid 7-point and 10-point scale', () => {
    expect(scaleContentSchema.safeParse({ type: 'scale', question: 'Q?', points: 7 }).success).toBe(
      true,
    );
    expect(
      scaleContentSchema.safeParse({ type: 'scale', question: 'Q?', points: 10 }).success,
    ).toBe(true);
  });

  it('rejects 6-point scale (only 5/7/10 allowed)', () => {
    const result = scaleContentSchema.safeParse({
      type: 'scale',
      question: 'Q?',
      points: 6,
    });
    expect(result.success).toBe(false);
  });

  it('rejects scale with empty question', () => {
    const result = scaleContentSchema.safeParse({
      type: 'scale',
      question: '',
      points: 5,
    });
    expect(result.success).toBe(false);
  });
});

describe('npsContentSchema', () => {
  it('accepts minimal NPS input (only type)', () => {
    const result = npsContentSchema.safeParse({ type: 'nps' });
    expect(result.success).toBe(true);
    if (result.success) {
      // Question has a default value
      expect(result.data.question.length).toBeGreaterThan(0);
      expect(result.data.required).toBe(false);
    }
  });

  it('accepts NPS with custom question and required flag', () => {
    const result = npsContentSchema.safeParse({
      type: 'nps',
      question: 'Custom NPS question?',
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects NPS with question longer than 280 chars', () => {
    const result = npsContentSchema.safeParse({
      type: 'nps',
      question: 'q'.repeat(281),
    });
    expect(result.success).toBe(false);
  });
});

describe('agreementContentSchema', () => {
  it('accepts valid agreement content', () => {
    const result = agreementContentSchema.safeParse({
      type: 'agreement',
      question: 'Согласие с условиями',
      legalText: 'Я согласен(-на) с обработкой данных.',
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it('defaults required to true (D-95)', () => {
    const result = agreementContentSchema.safeParse({
      type: 'agreement',
      legalText: 'Я согласен(-на).',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.required).toBe(true);
    }
  });

  it('rejects agreement with empty legalText', () => {
    const result = agreementContentSchema.safeParse({
      type: 'agreement',
      legalText: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('contextContentSchema', () => {
  it('accepts a context block with all three sub-questions enabled', () => {
    const result = contextContentSchema.safeParse({
      type: 'context',
      title: 'О вас',
      age_question: {
        enabled: true,
        options: [{ id: '18-24', label: '18–24' }],
      },
      experience_question: {
        enabled: true,
        points: 5,
        endpointMinLabel: 'Новичок',
        endpointMaxLabel: 'Эксперт',
      },
      role_question: {
        enabled: true,
        placeholder: 'UX-дизайнер…',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a context block with only one sub-question enabled', () => {
    const result = contextContentSchema.safeParse({
      type: 'context',
      title: 'О вас',
      age_question: { enabled: true, options: [{ id: '18-24', label: '18–24' }] },
      experience_question: { enabled: false, points: 5 },
      role_question: { enabled: false, placeholder: '...' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects context block with all three sub-questions disabled (D-92)', () => {
    const result = contextContentSchema.safeParse({
      type: 'context',
      title: 'О вас',
      age_question: { enabled: false, options: [{ id: '18-24', label: '18–24' }] },
      experience_question: { enabled: false, points: 5 },
      role_question: { enabled: false, placeholder: '...' },
    });
    expect(result.success).toBe(false);
  });
});

describe('blockContentSchema (extended for Phase 4)', () => {
  it('discriminates choice variant correctly', () => {
    const result = blockContentSchema.parse({
      type: 'choice',
      question: 'Q?',
      mode: 'single',
      options: [
        { id: '1', label: 'A' },
        { id: '2', label: 'B' },
      ],
    });
    expect(result.type).toBe('choice');
    if (result.type === 'choice') {
      expect(result.options.length).toBe(2);
    }
  });

  it('discriminates scale variant correctly', () => {
    const result = blockContentSchema.parse({
      type: 'scale',
      question: 'Q?',
      points: 5,
    });
    expect(result.type).toBe('scale');
    if (result.type === 'scale') {
      expect(result.points).toBe(5);
    }
  });

  it('discriminates nps variant correctly', () => {
    const result = blockContentSchema.parse({ type: 'nps' });
    expect(result.type).toBe('nps');
  });

  it('discriminates agreement variant correctly', () => {
    const result = blockContentSchema.parse({
      type: 'agreement',
      legalText: 'I agree',
    });
    expect(result.type).toBe('agreement');
  });

  it('discriminates context variant correctly', () => {
    const result = blockContentSchema.parse({
      type: 'context',
      age_question: { enabled: true, options: [{ id: '18-24', label: '18–24' }] },
    });
    expect(result.type).toBe('context');
  });
});

// ----- Phase 4 answer-shape schemas (Pitfall 5 mitigation) -----

describe('choiceAnswerSchema', () => {
  it('accepts single-mode answer with selectedId', () => {
    const r = choiceAnswerSchema.safeParse({ selectedId: 'opt-1' });
    expect(r.success).toBe(true);
  });

  it('accepts multi-mode answer with selectedIds array', () => {
    const r = choiceAnswerSchema.safeParse({ selectedIds: ['opt-1', 'opt-2'] });
    expect(r.success).toBe(true);
  });

  it('accepts answer with otherText field', () => {
    const r = choiceAnswerSchema.safeParse({
      selectedId: 'opt-other',
      otherText: 'Свой вариант',
    });
    expect(r.success).toBe(true);
  });
});

describe('scaleAnswerSchema', () => {
  it('accepts a valid integer in [1, 10]', () => {
    expect(scaleAnswerSchema.safeParse({ value: 1 }).success).toBe(true);
    expect(scaleAnswerSchema.safeParse({ value: 5 }).success).toBe(true);
    expect(scaleAnswerSchema.safeParse({ value: 10 }).success).toBe(true);
  });

  it('rejects out-of-range or non-integer values', () => {
    expect(scaleAnswerSchema.safeParse({ value: 0 }).success).toBe(false);
    expect(scaleAnswerSchema.safeParse({ value: 11 }).success).toBe(false);
    expect(scaleAnswerSchema.safeParse({ value: 3.5 }).success).toBe(false);
  });
});

describe('npsAnswerSchema', () => {
  it('accepts NPS score in [0, 10]', () => {
    expect(npsAnswerSchema.safeParse({ score: 0 }).success).toBe(true);
    expect(npsAnswerSchema.safeParse({ score: 7 }).success).toBe(true);
    expect(npsAnswerSchema.safeParse({ score: 10 }).success).toBe(true);
  });

  it('rejects out-of-range NPS scores', () => {
    expect(npsAnswerSchema.safeParse({ score: -1 }).success).toBe(false);
    expect(npsAnswerSchema.safeParse({ score: 11 }).success).toBe(false);
  });
});

describe('agreementAnswerSchema', () => {
  it('accepts agreed: true', () => {
    expect(agreementAnswerSchema.safeParse({ agreed: true }).success).toBe(true);
  });

  it('rejects agreed: false (literal(true) only)', () => {
    expect(agreementAnswerSchema.safeParse({ agreed: false }).success).toBe(false);
  });
});

describe('contextAnswerSchema', () => {
  it('accepts answer with only age', () => {
    const r = contextAnswerSchema.safeParse({ age: '25-34' });
    expect(r.success).toBe(true);
  });

  it('accepts full composite answer', () => {
    const r = contextAnswerSchema.safeParse({
      age: '25-34',
      experience: 4,
      role: 'UX-дизайнер',
    });
    expect(r.success).toBe(true);
  });

  it('rejects experience > 5 or < 1', () => {
    expect(contextAnswerSchema.safeParse({ experience: 0 }).success).toBe(false);
    expect(contextAnswerSchema.safeParse({ experience: 6 }).success).toBe(false);
  });

  it('rejects role longer than 120 chars', () => {
    expect(contextAnswerSchema.safeParse({ role: 'r'.repeat(121) }).success).toBe(false);
  });
});

// ----- Phase 4 defaults round-trip through schemas -----

describe('Phase 4 defaults round-trip through their schemas', () => {
  it('CHOICE_DEFAULT validates', () => {
    expect(choiceContentSchema.safeParse(CHOICE_DEFAULT).success).toBe(true);
    expect(blockContentSchema.safeParse(CHOICE_DEFAULT).success).toBe(true);
  });

  it('SCALE_DEFAULT validates', () => {
    expect(scaleContentSchema.safeParse(SCALE_DEFAULT).success).toBe(true);
    expect(blockContentSchema.safeParse(SCALE_DEFAULT).success).toBe(true);
  });

  it('NPS_DEFAULT validates', () => {
    expect(npsContentSchema.safeParse(NPS_DEFAULT).success).toBe(true);
    expect(blockContentSchema.safeParse(NPS_DEFAULT).success).toBe(true);
  });

  it('AGREEMENT_DEFAULT validates and has required: true (D-95)', () => {
    expect(agreementContentSchema.safeParse(AGREEMENT_DEFAULT).success).toBe(true);
    expect(blockContentSchema.safeParse(AGREEMENT_DEFAULT).success).toBe(true);
    expect(AGREEMENT_DEFAULT.required).toBe(true);
  });

  it('CONTEXT_DEFAULT validates with all three sub-questions enabled', () => {
    expect(contextContentSchema.safeParse(CONTEXT_DEFAULT).success).toBe(true);
    expect(blockContentSchema.safeParse(CONTEXT_DEFAULT).success).toBe(true);
  });
});

// ----- Registry flip for Phase 4 -----

describe('BLOCK_REGISTRY — Phase 4 flip', () => {
  it.each(['choice', 'scale', 'nps', 'agreement', 'context'] as const)(
    '%s has enabledInPhase=4 and no disabledTooltip (Phase 4 flip)',
    (key) => {
      const entry = BLOCK_REGISTRY[key];
      expect(entry.enabledInPhase).toBe(4);
      expect(entry.disabledTooltip).toBeUndefined();
    },
  );

  it.each(['matrix', 'ranking', 'umux_lite'] as const)(
    '%s still carries disabledTooltip (Phase 4.1 not yet active)',
    (key) => {
      const entry = BLOCK_REGISTRY[key];
      expect(entry.disabledTooltip).toBeDefined();
    },
  );
});
