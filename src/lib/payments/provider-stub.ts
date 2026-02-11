/**
 * Integración con proveedores de pago.
 * Mercado Pago: preferencia real (Checkout Pro). DLocal: stub pendiente.
 *
 * MercadoPago: https://www.mercadopago.com.ar/developers
 * DLocal: https://docs.dlocal.com/
 */

import type { PaymentProvider } from '@/lib/types/payments';
import { createMercadoPagoPreference } from './mercadopago-checkout';

export interface CreateIntentResult {
  checkoutUrl: string;
  providerPreferenceId: string;
}

export interface CreateIntentParams {
  playerId: string;
  schoolId: string;
  period: string;
  amount: number;
  currency: string;
  /** Access token de Mercado Pago de la escuela (OAuth por escuela). Obligatorio si provider === 'mercadopago'. */
  mercadopagoAccessToken?: string | null;
}

/**
 * Crea intención de pago con el proveedor.
 * Mercado Pago: crea preferencia real y devuelve init_point. DLocal: stub.
 */
export async function createPaymentIntentWithProvider(
  provider: PaymentProvider,
  params: CreateIntentParams
): Promise<CreateIntentResult> {
  if (provider === 'mercadopago') {
    if (!params.mercadopagoAccessToken) {
      throw new Error('La escuela no tiene Mercado Pago conectado. Conectá tu cuenta en Administración → Pagos → Configuración.');
    }
    const { init_point, preference_id } = await createMercadoPagoPreference(
      params.mercadopagoAccessToken,
      {
        playerId: params.playerId,
        schoolId: params.schoolId,
        period: params.period,
        amount: params.amount,
        currency: params.currency,
      }
    );
    return {
      checkoutUrl: init_point,
      providerPreferenceId: preference_id,
    };
  }

  // DLocal: stub hasta integrar
  const prefId = `stub_${provider}_${Date.now()}`;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';
  return {
    checkoutUrl: `${baseUrl}/dashboard/payments/checkout?preference=${prefId}`,
    providerPreferenceId: prefId,
  };
}
