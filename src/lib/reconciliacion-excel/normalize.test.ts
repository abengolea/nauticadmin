/**
 * Tests unitarios para el normalizador de conciliación Excel.
 */

import { describe, it, expect } from "vitest";
import { normalizeString, normalizeAccount, normalizePayer } from "./normalize";

describe("normalizeString", () => {
  it("retorna string vacío para input no string", () => {
    expect(normalizeString(null as unknown as string)).toBe("");
    expect(normalizeString(undefined as unknown as string)).toBe("");
  });

  it("aplica trim y uppercase", () => {
    expect(normalizeString("  juan pérez  ")).toBe("JUAN PEREZ");
    expect(normalizeString("maría garcía")).toBe("MARIA GARCIA");
  });

  it("elimina tildes y diacríticos", () => {
    expect(normalizeString("José Rodríguez")).toBe("JOSE RODRIGUEZ");
    expect(normalizeString("Ñoño")).toBe("NONO");
  });

  it("reemplaza signos por espacio y colapsa espacios", () => {
    expect(normalizeString("Apellido,Nombre")).toBe("APELLIDO NOMBRE");
    expect(normalizeString("García-López")).toBe("GARCIA LOPEZ");
    expect(normalizeString("Juan   Carlos")).toBe("JUAN CARLOS");
  });
});

describe("normalizeAccount", () => {
  it("normaliza cuenta AYB", () => {
    expect(normalizeAccount("A123-B456")).toBe("A123 B456");
    expect(normalizeAccount("  cuenta-01  ")).toBe("CUENTA 01");
  });
});

describe("normalizePayer", () => {
  it("normaliza pagador", () => {
    expect(normalizePayer("  ROJAS MARIA EUGENIA  ")).toBe("ROJAS MARIA EUGENIA");
    expect(normalizePayer("González, Juan")).toBe("GONZALEZ JUAN");
  });
});
