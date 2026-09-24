/**
 * Exporta Excel de cobros Visa conciliados que no se pudieron imputar + guía para el admin.
 *
 * Uso:
 *   PERIOD=2026-10 npx tsx scripts/export-visa-pendientes-imputacion.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";
import * as admin from "firebase-admin";
import { detectColumnMapping } from "../src/lib/reconciliacion-excel/column-mapping";
import { parseRelationsFromRows, buildPaymentsFromRows } from "../src/lib/reconciliacion-excel/parser";
import { runReconciliation } from "../src/lib/reconciliacion-excel/reconcile";
import { buildPlayerLookup } from "../src/lib/reconciliacion-excel/player-lookup";
import { RENDICION_DA_HEADERS } from "../src/lib/reconciliacion-excel/types";
import type { ImputePaymentItem, RelationRow } from "../src/lib/reconciliacion-excel/types";
import { cleanImputeTargetName, digitsOnly, imputeTargetNames } from "../src/lib/reconciliacion-excel/impute-match";
import { normalizeString } from "../src/lib/text-normalize";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

const SCHOOL_ID = process.env.SCHOOL_ID?.trim() ?? "WZAf1Mw08Uq047wneIxI";
const PERIOD = process.env.PERIOD?.trim() ?? "2026-10";
const LISTADO =
  process.env.LISTADO_CREDITO ?? String.raw`c:\Users\Adrian\Downloads\9 VISA CREDITO SEPTIEMBRE 2026.xlsx`;
const RENDICION =
  process.env.RENDICION_CREDITO ??
  String.raw`c:\Users\Adrian\Downloads\rendición_DA_visa-crédito resumen sept-cuota oct26.xlsx`;
const OUT =
  process.env.OUT_FILE ??
  String.raw`c:\Users\Adrian\Downloads\Visa_Oct2026_pendientes_imputacion.xlsx`;

function readXlsx(filePath: string): string[][] {
  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  return XLSX.utils
    .sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "", raw: false })
    .map((row) => row.map((c) => (c != null ? String(c).trim() : "")));
}

function initDb(): admin.firestore.Firestore {
  if (admin.apps.length) return admin.firestore();
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    (fs.existsSync("service-account.json") ? "service-account.json" : "");
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, "utf8"))),
  });
  return admin.firestore();
}

function findRelation(
  relations: RelationRow[],
  accountKey: string,
  cardLast4?: string
): RelationRow | undefined {
  return (
    relations.find(
      (rel) =>
        rel.accountKey === accountKey &&
        (!rel.cardLast4 || !cardLast4 || rel.cardLast4 === cardLast4)
    ) ?? relations.find((rel) => rel.accountKey === accountKey)
  );
}

function adminAction(rel: RelationRow | undefined, reason: string): string {
  const cliente =
    rel?.imputeToRaw?.trim() ||
    `${rel?.listadoLastName ?? ""} ${rel?.listadoFirstName ?? ""}`.trim();
  const clienteClean = cleanImputeTargetName(cliente);
  if (/empresa|SA|SRL|S\.A\./i.test(reason) || /empresa/i.test(rel?.imputeToRaw ?? "")) {
    return `Cliente a facturar: «${clienteClean}». Crear/corregir ficha con ese nombre y cargar CUIT. No usar solo el titular de la tarjeta.`;
  }
  if (rel?.imputeToRaw) {
    return `Cliente a facturar: «${clienteClean}» (col G). Buscar esa ficha, cargar CUIT/DNI del cliente — no necesariamente DNI ${rel.dni ?? "—"} del titular tarjeta.`;
  }
  return `Cliente a facturar: «${clienteClean}». Buscar/crear ficha y cargar CUIT/DNI de esa persona.`;
}

function buildReason(
  item: ImputePaymentItem,
  rel: RelationRow | undefined,
  players: Array<{ displayName: string; dni: string; archived: boolean }>
): string {
  const dni = digitsOnly(item.dni ?? rel?.dni ?? "");
  const targets = imputeTargetNames({
    imputeToRaw: rel?.imputeToRaw,
    listadoLastName: rel?.listadoLastName,
    listadoFirstName: rel?.listadoFirstName,
    accountRaw: item.accountRaw,
    payerRaw: item.payerRaw,
  });

  if (/SERVICIO|SEGURIDAD|PORTUAR|S\.A\.|SRL|SA\b/i.test(targets.join(" "))) {
    return "Empresa en listado Visa; no hay ficha con ese nombre en NauticAdmin.";
  }

  const withDni = players.filter((p) => p.dni === dni && !p.archived);
  if (withDni.length > 0) {
    return `El DNI ${dni} ya está en otra ficha (${withDni[0]!.displayName}); revisar titular vs embarcación.`;
  }

  const imputeTo = rel?.imputeToRaw ? cleanImputeTargetName(rel.imputeToRaw) : "";
  if (imputeTo && imputeTo !== cleanImputeTargetName(`${rel?.listadoLastName ?? ""} ${rel?.listadoFirstName ?? ""}`)) {
    return `Col G indica imputar a «${imputeTo}»; esa ficha no existe o no coincide en NauticAdmin.`;
  }

  return "No hay cliente en NauticAdmin con ese DNI ni nombre del listado Visa.";
}

async function main() {
  const listadoRows = readXlsx(LISTADO);
  const { relations } = parseRelationsFromRows(listadoRows, "credit");
  const rendRows = readXlsx(RENDICION);
  const headers = (rendRows[0] ?? []).map((h) => String(h ?? "").trim());
  const mapping = detectColumnMapping(headers.length ? headers : [...RENDICION_DA_HEADERS]);
  const { payments } = buildPaymentsFromRows(headers, rendRows.slice(1), mapping, "credit");

  const results = runReconciliation(relations, payments);
  const matched = results.filter((r) => r.status === "MATCHED");
  const items: ImputePaymentItem[] = matched.map((r) => {
    const rel = findRelation(relations, r.matchedAccountKey!, r.cardLast4);
    return {
      paymentRowId: r.paymentRowId,
      payerRaw: r.payerRaw,
      amount: r.amount ?? 0,
      accountKey: r.matchedAccountKey!,
      accountRaw: rel?.accountRaw ?? r.matchedAccountKey!,
      sourceKind: r.sourceKind,
      aplicada: r.aplicada,
      cardLast4: r.cardLast4,
      dni: rel?.dni,
      listadoLastName: rel?.listadoLastName,
      listadoFirstName: rel?.listadoFirstName,
      imputeToRaw: rel?.imputeToRaw,
    };
  });

  const db = initDb();
  const { findPlayer } = await buildPlayerLookup(db, SCHOOL_ID);
  const notFound = items.filter((item) => !findPlayer(item));

  const playersSnap = await db.collection(`schools/${SCHOOL_ID}/players`).get();
  const players = playersSnap.docs.map((d) => {
    const x = d.data() as { firstName?: string; lastName?: string; dni?: string; archived?: boolean };
    return {
      displayName: `${x.lastName ?? ""} ${x.firstName ?? ""}`.trim(),
      dni: digitsOnly(String(x.dni ?? "")),
      archived: x.archived === true,
    };
  });

  const dataRows = notFound.map((item, idx) => {
    const rel = findRelation(relations, item.accountKey, item.cardLast4);
    const reason = buildReason(item, rel, players);
    const imputarA = rel?.imputeToRaw
      ? cleanImputeTargetName(rel.imputeToRaw)
      : `${rel?.listadoLastName ?? ""} ${rel?.listadoFirstName ?? ""}`.trim();
    const titularTarjeta = `${rel?.listadoLastName ?? ""} ${rel?.listadoFirstName ?? ""}`.trim();
    const clienteFacturar = imputarA || titularTarjeta;
    return {
      N: idx + 1,
      "Cuota a imputar": PERIOD,
      "CLIENTE a imputar y facturar": clienteFacturar,
      "Titular tarjeta (solo referencia)": titularTarjeta,
      "Imputar a col G (original)": rel?.imputeToRaw ? cleanImputeTargetName(rel.imputeToRaw) : "",
      "DNI titular tarjeta (col C)": rel?.dni ?? digitsOnly(item.accountKey),
      "Pagador rendición banco": item.payerRaw,
      "Importe ARS": item.amount,
      "Tarjeta últimos 4": item.cardLast4 ?? "",
      "Motivo": reason,
      "Qué hacer en NauticAdmin": adminAction(rel, reason),
    };
  });

  const total = dataRows.reduce((s, r) => s + Number(r["Importe ARS"] ?? 0), 0);
  const imputados = items.length - notFound.length;

  const instrucciones: string[][] = [
    ["INSTRUCTIVO — Administrador de la náutica"],
    ["Cobros Visa pendientes de imputación (cuota octubre 2026)"],
    [""],
    ["REGLA PRINCIPAL (leer primero)"],
    [
      "El CLIENTE en NauticAdmin debe ser la persona o empresa A QUIEN LE FACTURAMOS.",
    ],
    [
      "No confundir con quien pagó con la tarjeta Visa. Muchas veces paga un familiar o un tercero, pero la cuota y la factura van al dueño de la embarcación o al cliente náutica.",
    ],
    [""],
    ["Tres roles distintos (no son lo mismo)"],
    ["1. Titular de la tarjeta", "Apellido y nombre del listado Visa (cols A–B). Pagó con Visa. Solo referencia."],
    ["2. Cliente náutica (col G)", "Columna G del listado «Imputar a». Es a quien corresponde la cuota Y a quien se factura en AFIP."],
    ["3. Pagador en rendición", "Nombre que informa el banco. Puede diferir levemente del listado. No usar para facturar."],
    [""],
    ["Qué hacer con el DNI del listado (col C)"],
    [
      "Ese DNI suele ser del titular de la tarjeta. Cargarlo en NauticAdmin SOLO si esa persona es también el cliente al que facturamos.",
    ],
    [
      "Si col G indica otra persona o empresa, buscar la ficha de col G y cargar el CUIT/DNI DE ESE CLIENTE (no el de la tarjeta).",
    ],
    [""],
    ["Contexto de este archivo"],
    [
      "Rendición Visa de septiembre = cuota octubre 2026 (mes adelantado). Ya conciliada contra el listado interno.",
    ],
    [
      `${imputados} cobros pueden imputarse solos. Los ${notFound.length} de la hoja «Pendientes» necesitan que completes o corrijas fichas de clientes.`,
    ],
    [""],
    ["Columnas de la hoja «Pendientes»"],
    ["Apellido / Nombre listado", "Titular de la tarjeta (referencia). NO es necesariamente a quien facturamos."],
    ["Imputar a (col G)", "CLIENTE CORRECTO: a quien imputar la cuota y a quien facturar. Prioridad absoluta."],
    ["DNI listado", "DNI del titular en el Excel. Usar en la ficha solo si coincide con el cliente de col G."],
    ["Pagador rendición banco", "Dato del banco. Solo control."],
    ["Importe ARS", "Monto del cobro a acreditar."],
    ["Qué hacer en NauticAdmin", "Acción concreta sugerida."],
    [""],
    ["Pasos (por cada fila pendiente)"],
    ["1", "Mirar «Imputar a (col G)». Si está vacío, el cliente es Apellido + Nombre del listado."],
    ["2", "Buscar esa persona o empresa en Clientes de NauticAdmin."],
    ["3", "Si no existe, crearla con el nombre de col G (o listado si no hay col G)."],
    ["4", "En esa ficha cargar CUIT (empresa) o DNI (persona) del CLIENTE A FACTURAR — no copiar a ciegas el DNI de la tarjeta."],
    ["5", "Verificar embarcación asociada al cliente correcto."],
    ["6", "Cuando terminen todas las filas, avisar para re-ejecutar «Simular imputación» (cuota 2026-10) y luego Imputar."],
    [""],
    ["Después de imputar — Facturación"],
    [
      "En Cobros ingresados, NauticAdmin factura al mismo cliente donde quedó acreditado el pago. Por eso la ficha debe ser quien recibe la factura.",
    ],
    [""],
    ["Resumen"],
    ["Cuota", PERIOD],
    ["Pendientes (filas)", String(notFound.length)],
    ["Total ARS pendiente", total.toLocaleString("es-AR")],
    ["Generado", new Date().toLocaleString("es-AR")],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instrucciones), "Instrucciones");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(dataRows, { header: Object.keys(dataRows[0] ?? {}) }),
    "Pendientes"
  );

  const resumen = [
    ["Concepto", "Valor"],
    ["Cuota imputación", PERIOD],
    ["Conciliados total", items.length],
    ["Imputables automáticamente", imputados],
    ["Pendientes manual", notFound.length],
    ["Total ARS pendientes", total],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  XLSX.writeFile(wb, OUT);
  console.log(`Archivo generado: ${OUT}`);
  console.log(`Pendientes: ${notFound.length} · Total ARS ${total.toLocaleString("es-AR")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
