/**
 * El envío automático solo puede quedar registrado cuando FITCV resolvió todo
 * sin inventar, y una postulación enviada no retrocede.
 */
import { describe, it, expect } from 'vitest';
import {
  APPLY_STATUSES,
  canTransition,
  isApplyStatus,
  isAttentionReason,
  qualifiesForAutoSend,
} from '../src/services/applyStatus.js';

describe('apply status transitions', () => {
  it('follows the extension flow: queued, sending, sent', () => {
    expect(canTransition('pendiente', 'en-cola')).toBe(true);
    expect(canTransition('en-cola', 'enviando')).toBe(true);
    expect(canTransition('enviando', 'enviada')).toBe(true);
  });

  it('lets a blocked application go back to the queue once the candidate handles it', () => {
    expect(canTransition('enviando', 'requiere-atencion')).toBe(true);
    expect(canTransition('requiere-atencion', 'en-cola')).toBe(true);
    expect(canTransition('error', 'en-cola')).toBe(true);
  });

  it('never moves a sent application anywhere', () => {
    for (const to of APPLY_STATUSES) {
      expect(canTransition('enviada', to)).toBe(false);
    }
  });

  it('does not let a queued application be marked as needing attention without being tried', () => {
    expect(canTransition('en-cola', 'requiere-atencion')).toBe(false);
    expect(canTransition('pendiente', 'enviando')).toBe(false);
  });

  it('validates status and reason values', () => {
    expect(isApplyStatus('enviada')).toBe(true);
    expect(isApplyStatus('sent')).toBe(false);
    expect(isAttentionReason('captcha')).toBe(true);
    expect(isAttentionReason('bypass')).toBe(false);
  });
});

describe('qualifiesForAutoSend', () => {
  it('accepts a form resolved entirely from the CV', () => {
    expect(qualifiesForAutoSend([{ status: 'filled' }, { status: 'use-adapted-cv' }])).toBe(true);
  });

  it('accepts a form with nothing to answer', () => {
    expect(qualifiesForAutoSend([])).toBe(true);
  });

  it('rejects a form with a draft to approve or a personal decision', () => {
    expect(qualifiesForAutoSend([{ status: 'filled' }, { status: 'needs-approval' }])).toBe(false);
    expect(qualifiesForAutoSend([{ status: 'needs-user' }])).toBe(false);
  });
});
