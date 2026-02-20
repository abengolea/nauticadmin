/**
 * Utilidades para el módulo de Gastos:
 * - Validaciones contables (total == neto + iva)
 * - Detección de duplicados
 */

import type { Expense, ExpenseAmounts } from './types';
import { validateCuitDigit } from './normalize';
import type { Firestore } from 'firebase-admin/firestore';

const TOLERANCE = 0.01; // 1 centavo de tolerancia por redondeo

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE;
}

/**
 * Valida que total == neto + iva (y percepciones si existen).
 */
export function validateTotalMatches(amounts: ExpenseAmounts): boolean {
  const { total, net, iva, breakdown } = amounts;
  if (net === undefined && iva === undefined) return true; // Ticket sin desglose
  let expected = 0;
  if (net !== undefined) expected += net;
  if (iva !== undefined) expected += iva;
  if (breakdown?.percepciones?.length) {
    for (const p of breakdown.percepciones) {
      expected += p.amount;
    }
  }
  return approxEqual(total, expected);
}

/**
 * Valida que iva coincida con alícuotas si están presentes.
 */
export function validateIvaMatches(amounts: ExpenseAmounts): boolean {
  const { iva, breakdown } = amounts;
  if (iva === undefined || !breakdown?.alicuotas?.length) return true;
  const sumAlicuotas = breakdown.alicuotas.reduce((s, a) => s + a.amount, 0);
  return approxEqual(iva, sumAlicuotas);
}

/**
 * Valida CUIT si está presente.
 */
export function validateCuit(cuit: string | undefined): boolean {
  if (!cuit?.trim()) return true;
  const digits = cuit.replace(/\D/g, '');
  return digits.length === 11 && validateCuitDigit(digits);
}

/**
 * Clave de deduplicación: issuerCUIT + pos + number + total + date
 */
export function getDedupeKey(expense: Pick<Expense, 'supplier' | 'invoice' | 'amounts'>): string {
  const cuit = (expense.supplier?.cuit ?? '').replace(/\D/g, '');
  const pos = expense.invoice?.pos ?? '';
  const number = expense.invoice?.number ?? '';
  const total = String(expense.amounts?.total ?? 0);
  const date = expense.invoice?.issueDate ?? '';
  return `${cuit}|${pos}|${number}|${total}|${date}`;
}

/**
 * Busca candidatos duplicados en Firestore.
 * Retorna los expenseIds que coinciden con la clave de deduplicación.
 */
export async function findDuplicateCandidates(
  db: Firestore,
  schoolId: string,
  expense: Pick<Expense, 'supplier' | 'invoice' | 'amounts'>,
  excludeExpenseId?: string
): Promise<string[]> {
  const key = getDedupeKey(expense);
  const [, , , total] = key.split('|');
  if (!total || total === '0') return [];

  const expensesRef = db.collection('schools').doc(schoolId).collection('expenses');
  const query = expensesRef
    .where('status', 'in', ['confirmed', 'paid'])
    .where('amounts.total', '==', parseFloat(total))
    .limit(50);

  const snap = await query.get();
  const candidates: string[] = [];
  for (const doc of snap.docs) {
    if (excludeExpenseId && doc.id === excludeExpenseId) continue;
    const data = doc.data() as Expense;
    const docKey = getDedupeKey(data);
    if (docKey === key) candidates.push(doc.id);
  }
  return candidates;
}
