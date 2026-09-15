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
  mergeResolution,
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

  it('holds an application below the salary range until the candidate authorises it', () => {
    expect(canTransition('pendiente', 'requiere-autorizacion')).toBe(true);
    expect(canTransition('requiere-autorizacion', 'en-cola')).toBe(true);
    expect(canTransition('requiere-autorizacion', 'pendiente')).toBe(true);
    // Nunca se envía directo desde la cola sin pasar por la autorización.
    expect(canTransition('requiere-autorizacion', 'enviando')).toBe(false);
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

  it('leaves an optional field blank instead of blocking the send', () => {
    const resolutions = [
      { fieldId: 'name', status: 'filled' },
      { fieldId: 'letter', status: 'needs-approval' },
    ];
    expect(qualifiesForAutoSend(resolutions, [{ id: 'name', required: true }, { id: 'letter', required: false }])).toBe(true);
  });

  it('does not block on a marketing checkbox left unchecked on purpose', () => {
    expect(qualifiesForAutoSend([{ fieldId: 'terms', status: 'filled' }, { fieldId: 'news', status: 'leave-blank' }])).toBe(true);
  });

  it('treats a field without an optional mark as required', () => {
    const resolutions = [{ fieldId: 'salary', status: 'needs-user' }];
    expect(qualifiesForAutoSend(resolutions, [{ id: 'salary' }])).toBe(false);
  });
});

describe('mergeResolution', () => {
  const ok = { autoSendable: true, fieldCount: 2, summary: { filled: 2 } };
  const blocked = { autoSendable: false, fieldCount: 1, summary: { 'needs-user': 1 } };

  it('starts a record on the first step', () => {
    expect(mergeResolution(null, ok)).toEqual({ ...ok, steps: 1 });
  });

  it('does not let a later clean step erase an earlier blocked one', () => {
    const merged = mergeResolution(mergeResolution(null, blocked), ok);
    expect(merged).toEqual({ autoSendable: false, fieldCount: 3, summary: { 'needs-user': 1, filled: 2 }, steps: 2 });
  });

  it('keeps qualifying when every step qualifies', () => {
    expect(mergeResolution(mergeResolution(null, ok), ok).autoSendable).toBe(true);
  });
});
