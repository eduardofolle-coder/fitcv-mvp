/**
 * Fidelity test harness — spec Section 8.5
 *
 * Por cada CV de fixtures/cvs10.json y cada proveedor:
 *   1. cv-adapter con el proveedor candidato
 *   2. cv-verifier con Kimi como juez fijo (nunca un modelo se juzga a sí mismo)
 *   3. % de highlights/afirmaciones "supported", latencia, fallos y costo real
 * Kimi corre también como línea base (adapter Kimi → juez Kimi).
 *
 * Uso: npx tsx src/scripts/fidelityTest.ts [runsPorCv]
 * FIDELITY_CANDIDATES=gemini,deepseek para cambiar candidatos (por defecto: gemini).
 * Los CVs son sintéticos y anonimizados: no se usan datos de candidatos reales.
 */

import 'dotenv/config';
import axios from 'axios';
import { readFileSync } from 'fs';
import { AgentInvokerService, AGENT_CONFIG } from '../services/agentInvoker.js';
import { extractJson } from '../utils/safeJson.js';

interface ProviderConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKeyEnv: string;
  model: string;
  shape: 'anthropic' | 'openai';
  inputPer1M: number;
  outputPer1M: number;
}

const KIMI: ProviderConfig = {
  id: 'kimi',
  name: 'Kimi K2.7 Code (control/juez)',
  apiUrl: process.env.CLAUDE_API_URL ?? 'https://api.moonshot.ai/anthropic/v1/messages',
  apiKeyEnv: 'CLAUDE_API_KEY',
  model: process.env.CLAUDE_MODEL ?? 'kimi-k2.7-code-highspeed',
  shape: 'anthropic',
  inputPer1M: 0.95,
  outputPer1M: 4.0,
};

const CANDIDATES: ProviderConfig[] = [
  {
    id: 'gemini',
    name: 'Gemini 2.5 Flash-Lite',
    apiUrl: process.env.GEMINI_API_URL ?? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    apiKeyEnv: 'GEMINI_API_KEY',
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
    shape: 'openai',
    inputPer1M: 0.1,
    outputPer1M: 0.4,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek V4 Pro',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
    shape: 'openai',
    inputPer1M: 0.66,
    outputPer1M: 1.98,
  },
];

// Juez fijo e independiente de los candidatos. Por defecto Kimi; con
// FIDELITY_JUDGE=deepseek se usa DeepSeek (p. ej. si la cuenta de Kimi no tiene saldo).
const JUDGE: ProviderConfig = process.env.FIDELITY_JUDGE === 'deepseek' ? CANDIDATES.find(p => p.id === 'deepseek')! : KIMI;

/** Números (cifras, %) que aparecen en el texto reescrito pero no en el original: inventos verificables sin juez. */
const numbersOf = (t: string) => (t.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => n.replace(',', '.'));
const inventedNumbers = (original: string, rewritten: string) => {
  const src = new Set(numbersOf(original));
  return numbersOf(rewritten).filter(n => !src.has(n));
};

interface Fixture { rubro: string; hardData: any; job: any }
const FIXTURES: Fixture[] = JSON.parse(readFileSync(new URL('./fixtures/cvs10.json', import.meta.url), 'utf-8'));

const TEMPERATURE = 0.3;
const TIMEOUT_MS = 180_000;

interface CallResult { text: string; latencyMs: number; costUsd: number }

async function callProvider(provider: ProviderConfig, agentName: 'cv-adapter' | 'cv-verifier', input: Record<string, unknown>): Promise<CallResult> {
  const apiKey = process.env[provider.apiKeyEnv] ?? '';
  const cfg = AGENT_CONFIG[agentName];
  const prompt = AgentInvokerService.buildPrompt(agentName, input);
  const t0 = Date.now();
  const body = { model: provider.model, max_tokens: cfg.maxTokens, temperature: TEMPERATURE, messages: [{ role: 'user', content: prompt }] };

  let text: string, inTok: number, outTok: number;
  if (provider.shape === 'anthropic') {
    const res = await axios.post(provider.apiUrl, body, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, timeout: TIMEOUT_MS });
    text = (res.data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
    inTok = res.data.usage?.input_tokens ?? 0;
    outTok = res.data.usage?.output_tokens ?? 0;
  } else {
    const res = await axios.post(provider.apiUrl, body, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: TIMEOUT_MS });
    text = res.data.choices?.[0]?.message?.content ?? '';
    inTok = res.data.usage?.prompt_tokens ?? 0;
    outTok = res.data.usage?.completion_tokens ?? 0;
  }
  return { text, latencyMs: Date.now() - t0, costUsd: (inTok / 1e6) * provider.inputPer1M + (outTok / 1e6) * provider.outputPer1M };
}

function buildVerifierInput(fx: Fixture, adapterOutput: any): Record<string, unknown> {
  const highlights: Array<{ id: string; original: string; rewritten: string }> = [];
  const narrativeHighlights: Record<string, Array<{ text: string; sourceIndex: number }>> = adapterOutput?.narrative?.highlights ?? {};
  for (const [expId, items] of Object.entries(narrativeHighlights)) {
    const exp = fx.hardData.experience.find((e: any) => e.id === expId);
    if (!exp) continue;
    for (const item of items) {
      const original = exp.details[item.sourceIndex];
      if (original) highlights.push({ id: `${expId}#${item.sourceIndex}`, original, rewritten: item.text });
    }
  }
  const statements: Array<{ id: string; text: string }> = [];
  if (adapterOutput?.narrative?.headline) statements.push({ id: 'headline', text: adapterOutput.narrative.headline });
  if (adapterOutput?.narrative?.summary) statements.push({ id: 'summary', text: adapterOutput.narrative.summary });
  return { facts: fx.hardData, highlights, statements };
}

interface Stats {
  name: string; attempts: number; adapterFail: number; verifierFail: number;
  hlOk: number; hlTotal: number; stOk: number; stTotal: number;
  latencies: number[]; costUsd: number; unsupported: string[];
  hlChecked: number; hlInvented: number; // chequeo numérico sin juez
}

const count = (arr: Array<{ verdict: string }>) => ({ ok: arr.filter(x => x.verdict === 'supported').length, total: arr.length });

/** Corre todos los CVs de un proveedor, en serie (evita 429). */
async function runProvider(provider: ProviderConfig, runs: number): Promise<Stats> {
  const s: Stats = { name: provider.name, attempts: 0, adapterFail: 0, verifierFail: 0, hlOk: 0, hlTotal: 0, stOk: 0, stTotal: 0, latencies: [], costUsd: 0, unsupported: [], hlChecked: 0, hlInvented: 0 };
  for (const [i, fx] of FIXTURES.entries()) {
    for (let r = 0; r < runs; r++) {
      s.attempts++;
      const tag = `[${provider.id}] cv ${i + 1}/${FIXTURES.length} (${fx.rubro})`;
      let out: any;
      try {
        const a = await callProvider(provider, 'cv-adapter', { hardData: fx.hardData, job: fx.job });
        s.latencies.push(a.latencyMs);
        s.costUsd += a.costUsd;
        out = extractJson<any>(a.text);
      } catch (e: any) {
        s.adapterFail++;
        console.log(`${tag} adapter FAIL: ${String(e?.response?.status ?? e.message).slice(0, 60)}`);
        continue;
      }
      if (!out || out.success === false) { s.adapterFail++; console.log(`${tag} adapter devolvió JSON inválido/fallo`); continue; }

      const vin = buildVerifierInput(fx, out) as any;
      if (!vin.highlights.length && !vin.statements.length) { s.adapterFail++; console.log(`${tag} sin highlights ni resumen`); continue; }
      for (const h of vin.highlights as Array<{ id: string; original: string; rewritten: string }>) {
        s.hlChecked++;
        const bad = inventedNumbers(h.original, h.rewritten);
        if (bad.length) { s.hlInvented++; s.unsupported.push(`${fx.rubro}: NÚMERO NUEVO ${bad.join(',')} — «${h.rewritten.slice(0, 80)}»`); }
      }
      try {
        const v = await callProvider(JUDGE, 'cv-verifier', vin);
        s.costUsd += 0; // el costo del juez es igual para todos: no entra en la comparación
        const vo = extractJson<any>(v.text);
        if (!vo || vo.success === false) { s.verifierFail++; console.log(`${tag} verificador no parseó`); continue; }
        const hl = count(vo.highlights ?? []); const st = count(vo.statements ?? []);
        s.hlOk += hl.ok; s.hlTotal += hl.total; s.stOk += st.ok; s.stTotal += st.total;
        for (const x of [...(vo.highlights ?? []), ...(vo.statements ?? [])]) if (x.verdict !== 'supported') s.unsupported.push(`${fx.rubro}: ${x.verdict} — ${String(x.reason ?? x.text ?? '').slice(0, 90)}`);
        console.log(`${tag} ok  hl=${hl.ok}/${hl.total} st=${st.ok}/${st.total}  ${(s.latencies.at(-1)! / 1000).toFixed(1)}s`);
      } catch (e: any) {
        s.verifierFail++;
        console.log(`${tag} verificador FAIL: ${String(e?.response?.status ?? e.message).slice(0, 60)}`);
      }
    }
  }
  return s;
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : 'n/a');

async function main(): Promise<void> {
  const runs = Math.max(1, parseInt(process.argv[2] ?? '1', 10) || 1);
  const wanted = (process.env.FIDELITY_CANDIDATES ?? 'gemini').split(',');
  const candidates = CANDIDATES.filter(p => wanted.includes(p.id) && process.env[p.apiKeyEnv]);
  if (!candidates.length || !process.env[JUDGE.apiKeyEnv]) { console.error(`Faltan claves: se necesita ${JUDGE.apiKeyEnv} (juez) y al menos un candidato.`); process.exit(1); }

  console.log(`FIDELITY TEST — ${FIXTURES.length} CVs × ${runs} corrida(s); juez: ${JUDGE.name}\n`);
  // Proveedores en paralelo entre sí, cada uno en serie internamente. FIDELITY_NO_CONTROL=1 omite a Kimi (sin saldo).
  const contenders = process.env.FIDELITY_NO_CONTROL ? candidates : [KIMI, ...candidates];
  const results = await Promise.all(contenders.map(p => runProvider(p, runs)));

  console.log('\n' + '═'.repeat(88));
  console.log('Proveedor'.padEnd(32), 'Highlights'.padEnd(11), 'Afirmac.'.padEnd(9), 'Fallos'.padEnd(8), 'Lat. prom'.padEnd(10), 'Costo adapter');
  for (const s of results) {
    const lat = s.latencies.length ? (s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length / 1000).toFixed(1) + 's' : 'n/a';
    console.log(s.name.padEnd(32), pct(s.hlOk, s.hlTotal).padEnd(11), pct(s.stOk, s.stTotal).padEnd(9), `${s.adapterFail + s.verifierFail}/${s.attempts}`.padEnd(8), lat.padEnd(10), `$${(s.costUsd / Math.max(1, s.attempts - s.adapterFail)).toFixed(5)}/CV`);
  }
  for (const s of results) console.log(`${s.name}: highlights con número inventado (chequeo sin juez): ${s.hlInvented}/${s.hlChecked}`);
  const control = process.env.FIDELITY_NO_CONTROL ? null : results[0];
  const cTotal = control ? control.hlTotal + control.stTotal : 0;
  for (const s of control ? results.slice(1) : results) {
    const tot = s.hlTotal + s.stTotal;
    const o = tot ? (s.hlOk + s.stOk) / tot : NaN;
    const vs = control && cTotal ? ` vs control ${Math.round(((control.hlOk + control.stOk) / cTotal) * 100)}% → ${o >= (control.hlOk + control.stOk) / cTotal ? 'PASA (>= control)' : 'NO PASA (bajo el control)'}` : ' (sin control: Kimi no disponible)';
    console.log(`\n${s.name}: fidelidad global ${Number.isNaN(o) ? 'n/a (sin veredictos)' : Math.round(o * 100) + '%'}${vs}`);
    if (s.unsupported.length) console.log('  No "supported":\n   - ' + s.unsupported.slice(0, 12).join('\n   - '));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
