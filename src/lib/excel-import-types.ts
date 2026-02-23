/**
 * Tipos y constantes para la importación de clientes desde Excel.
 * Separado del flow "use server" para poder importarse desde componentes cliente.
 */

/** Campos posibles del sistema de clientes náuticos */
export const EXCEL_FIELD_MAP = {
  apellidoNombres: 'Apellido Nombres / Razón Social',
  email: 'Email / Correo',
  telefono: 'Teléfono',
  datosEmbarcacion: 'Datos embarcación',
  nombreEmbarcacion: 'Nombre embarcación',
  matricula: 'Matrícula',
  creditoActivo: 'Crédito Activo',
  ubicacion: 'Ubicación',
  clienteDesde: 'Cliente Desde',
  medidas: 'Medidas',
  observaciones: 'Observaciones / Demás',
  personasAutorizadas: 'Personas autorizadas a manejar',
} as const;

export type ExcelFieldKey = keyof typeof EXCEL_FIELD_MAP;
