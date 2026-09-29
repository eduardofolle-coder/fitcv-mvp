// Orden de proveedores de IA: Gemini primero, Kimi de respaldo, DeepSeek al final.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { post } }));

process.env.GEMINI_API_KEY = 'g'.repeat(30);
process.env.CLAUDE_API_KEY = 'k'.repeat(30);
process.env.DEEPSEEK_API_KEY = '';
process.env.GEMINI_API_URL = 'https://gemini.test/chat';
process.env.CLAUDE_API_URL = 'https://kimi.test/messages';

const gemini = (text: string) => ({ data: { choices: [{ message: { content: text } }], usage: { prompt_tokens: 1, completion_tokens: 1 } } });
const kimi = (text: string) => ({ data: { content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 } } });
const httpError = (status: number) => Object.assign(new Error(`http ${status}`), { response: { status } });

describe('orden de proveedores de IA', () => {
  beforeEach(() => post.mockReset());

  it('usa Gemini y no toca Kimi cuando Gemini responde', async () => {
    post.mockResolvedValueOnce(gemini('desde gemini'));
    const { AgentInvokerService } = await import('../src/services/agentInvoker.js');
    expect(await AgentInvokerService.ask('hola')).toBe('desde gemini');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('https://gemini.test/chat');
  });

  it('cae a Kimi cuando Gemini falla con 429 dos veces', async () => {
    post.mockRejectedValueOnce(httpError(429)).mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce(kimi('desde kimi'));
    const { AgentInvokerService } = await import('../src/services/agentInvoker.js');
    expect(await AgentInvokerService.ask('hola')).toBe('desde kimi');
    expect(post.mock.calls.map(c => c[0])).toEqual(['https://gemini.test/chat', 'https://gemini.test/chat', 'https://kimi.test/messages']);
  });
});
