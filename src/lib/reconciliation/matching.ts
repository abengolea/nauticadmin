/**
 * Motor de matching para conciliación.
 * Orquesta normalize, scoring y reglas de decisión.
 */

import { normalizeAndTokenize, normalizeName } from './normalize';
import {
  buildPayerNorm,
  getTopCandidates,
  getMatchDecision,
} from './scoring';
import type {
  RecClient,
  RecPayment,
  RecMatch,
  MatchResult,
  PayerAlias,
} from './types';

/** Genera payment_id estable para idempotencia */
export function makePaymentId(
  idUsuario: string,
  importBatchId: string,
  nroTarjeta: string,
  importe: number,
  rowIndex: number
): string {
  const str = `${idUsuario}|${importBatchId}|${nroTarjeta}|${importe}|${rowIndex}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = (hash << 5) - hash + c;
    hash = hash & hash;
  }
  return `pay_${Math.abs(hash).toString(36)}`;
}

/**
 * Ejecuta el matching para un pago contra la lista de clientes y aliases.
 */
export function matchPayment(
  payment: { dato_opcional_1: string; dato_opcional_2: string; id_usuario: string },
  clients: RecClient[],
  aliases: Map<string, PayerAlias>
): MatchResult {
  const payerNorm = buildPayerNorm(payment.dato_opcional_1, payment.dato_opcional_2);
  const { tokens: payerTokens } = normalizeAndTokenize(payerNorm);

  const alias = aliases.get(payerNorm);
  if (alias && (alias.client_id || (alias as PayerAlias & { _resolved_client_id?: string })._resolved_client_id)) {
    const clientId = alias.client_id ?? (alias as PayerAlias & { _resolved_client_id?: string })._resolved_client_id;
    if (clientId) {
      const client = clients.find((c) => c.client_id === clientId);
      return {
        decision: 'auto',
        payment_id: '', // se asigna después
        client_id: clientId,
        score: 100,
        top_candidates: client
          ? [{ client_id: client.client_id, client_name_raw: client.full_name_raw, score: 100 }]
          : [],
        explanation: `Alias: ${payerNorm} -> ${clientId}`,
        reason: 'alias',
      };
    }
  }

  const clientList = clients.map((c) => ({
    client_id: c.client_id,
    full_name_raw: c.full_name_raw,
    full_name_norm: c.full_name_norm,
    tokens: c.tokens,
  }));

  const topCandidates = getTopCandidates(
    payerNorm,
    payerTokens,
    clientList,
    5
  );

  const decision = getMatchDecision(topCandidates);
  const top1 = topCandidates[0];

  let clientId: string | undefined;
  let score = 0;
  let reason: 'exact' | 'fuzzy' | undefined;

  if (decision === 'auto' && top1) {
    clientId = top1.client_id;
    score = top1.score;
    reason = score === 100 ? 'exact' : 'fuzzy';
  }

  let explanation = '';
  if (decision === 'auto') {
    explanation = reason === 'exact'
      ? 'Coincidencia exacta'
      : `Fuzzy match (score ${score}, gap >= 10)`;
  } else if (decision === 'review') {
    explanation = `Revisar: score ${top1?.score ?? 0}, gap < 10`;
  } else if (decision === 'conflict') {
    explanation = `Conflicto: top1=${top1?.score ?? 0}, top2=${topCandidates[1]?.score ?? 0}, gap < 5`;
  } else {
    explanation = `Sin match: score ${top1?.score ?? 0} < 75`;
  }

  return {
    decision,
    payment_id: '',
    client_id: clientId,
    score: top1?.score ?? 0,
    top_candidates: topCandidates,
    explanation,
    reason,
  };
}
