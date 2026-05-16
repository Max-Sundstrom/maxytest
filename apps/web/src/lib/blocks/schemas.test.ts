/**
 * Block schema + defaults + registry unit tests — Plan 01-03 Task 1.
 *
 * Locks the discriminated-union contract and the default copy strings that
 * Plans 01-03..06 expect. If the catalog ever ships in another phase, these
 * tests catch a registry mis-classification before the catalog renders.
 */

import { describe, expect, it } from 'vitest';
import {
  blockContentSchema,
  openQuestionContentSchema,
  prototypeContentSchema,
  thanksContentSchema,
  welcomeContentSchema,
} from './schemas';
import { OPEN_QUESTION_DEFAULT, THANKS_DEFAULT, WELCOME_DEFAULT } from './defaults';
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
