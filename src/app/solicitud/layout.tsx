/**
 * Layout minimal para pantalla de solicitud táctil (kiosk/pad).
 * Sin header ni footer para maximizar el área útil en pantalla táctil.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Solicitar embarcación | NauticAdmin',
  description: 'Solicitá tu embarcación en la náutica. Sin registro.',
};

export default function SolicitudLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col overflow-hidden touch-manipulation">
      {children}
    </div>
  );
}
