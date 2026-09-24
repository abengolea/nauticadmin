import { describe, it, expect } from "vitest";
import {
  applySavedColumnMapping,
  detectColumnMapping,
  unusedHeaders,
  normalizeColumnMapping,
  mappingFromAiResult,
  findBestProfile,
  shouldInviteNewProfileName,
  namesClash,
  mappingProfileId,
} from "./column-mapping";
import type { ColumnMapping, MappingProfile } from "./types";

const CREDIT_HEADERS = ["Titular", "Importe", "Fecha", "Comercio", "Autorización"];
const DEBIT_HEADERS = ["Cuenta", "Monto", "Fecha operación", "Referencia", "CBU"];

describe("detectColumnMapping", () => {
  it("detecta columnas típicas de crédito", () => {
    const m = detectColumnMapping(CREDIT_HEADERS);
    expect(m.payer).toBe("Titular");
    expect(m.amount).toBe("Importe");
    expect(m.date).toBe("Fecha");
    expect(m.reference).toBe("");
    expect(m.extras).toEqual([]);
  });

  it("detecta columnas típicas de débito", () => {
    const m = detectColumnMapping(DEBIT_HEADERS);
    expect(m.amount).toBe("Monto");
    expect(m.date).toBe("Fecha operación");
    expect(m.reference).toBe("Referencia");
  });
});

describe("applySavedColumnMapping", () => {
  const savedCredit: ColumnMapping = {
    payer: "Titular",
    amount: "Importe",
    date: "Fecha",
    reference: "",
    extras: [
      { id: "e1", label: "Comercio", column: "Comercio" },
      { id: "e2", label: "Autorización", column: "Autorización" },
    ],
  };

  it("reusa el mapeo guardado cuando los headers coinciden", () => {
    const m = applySavedColumnMapping(CREDIT_HEADERS, savedCredit);
    expect(m.payer).toBe("Titular");
    expect(m.amount).toBe("Importe");
    expect(m.extras.map((e) => e.column)).toEqual(["Comercio", "Autorización"]);
  });

  it("no aplica columnas de crédito sobre un archivo de débito", () => {
    const m = applySavedColumnMapping(DEBIT_HEADERS, savedCredit);
    expect(m.payer).toBe("");
    expect(m.amount).toBe("Monto");
    expect(m.date).toBe("Fecha operación");
    expect(m.extras.every((e) => e.column === "")).toBe(true);
    expect(m.extras.map((e) => e.label)).toEqual(["Comercio", "Autorización"]);
  });

  it("cae a detección automática si no hay mapeo guardado", () => {
    const m = applySavedColumnMapping(CREDIT_HEADERS, null);
    expect(m.payer).toBe("Titular");
    expect(m.amount).toBe("Importe");
    expect(m.extras).toEqual([]);
  });
});

describe("unusedHeaders", () => {
  it("lista columnas que todavía no se mapearon", () => {
    const mapping: ColumnMapping = {
      payer: "Titular",
      amount: "Importe",
      date: "Fecha",
      reference: "",
      extras: [],
    };
    expect(unusedHeaders(CREDIT_HEADERS, mapping)).toEqual(["Comercio", "Autorización"]);
  });
});

describe("normalizeColumnMapping", () => {
  it("limpia extras vacíos y recorta strings", () => {
    const m = normalizeColumnMapping({
      payer: "  Titular  ",
      amount: "Importe",
      extras: [
        { id: "a", label: "  Comercio ", column: "Comercio" },
        { id: "b", label: "", column: "" },
      ],
    });
    expect(m?.payer).toBe("Titular");
    expect(m?.extras).toEqual([{ id: "a", label: "Comercio", column: "Comercio" }]);
  });

  it("retorna null si el payload no es un objeto", () => {
    expect(normalizeColumnMapping(null)).toBeNull();
    expect(normalizeColumnMapping("x")).toBeNull();
  });
});

describe("mappingFromAiResult", () => {
  it("arma cores y extras, y completa columnas que la IA no mapeó", () => {
    const m = mappingFromAiResult(CREDIT_HEADERS, {
      payer: "Titular",
      amount: "Importe",
      date: "Fecha",
      extras: [{ label: "Comercio", column: "Comercio" }],
    });
    expect(m.payer).toBe("Titular");
    expect(m.amount).toBe("Importe");
    expect(m.extras.map((e) => e.column).sort()).toEqual(["Autorización", "Comercio"]);
  });

  it("ignora columnas que no existen en el archivo", () => {
    const m = mappingFromAiResult(DEBIT_HEADERS, {
      payer: "Titular",
      amount: "Monto",
    });
    expect(m.payer).toBe("");
    expect(m.amount).toBe("Monto");
  });
});

describe("findBestProfile", () => {
  const creditProfile: MappingProfile = {
    id: "visa_credito",
    name: "Visa Crédito",
    kind: "credit",
    mapping: {
      payer: "Titular",
      amount: "Importe",
      date: "Fecha",
      reference: "",
      extras: [{ id: "e1", label: "Comercio", column: "Comercio" }],
    },
    headers: CREDIT_HEADERS,
    updatedAt: "",
  };

  it("elige el perfil cuyo layout coincide", () => {
    expect(findBestProfile(CREDIT_HEADERS, [creditProfile], "credit")?.id).toBe("visa_credito");
  });

  it("no fuerza un perfil de crédito sobre un débito", () => {
    expect(findBestProfile(DEBIT_HEADERS, [creditProfile], "debit")).toBeNull();
  });
});

describe("shouldInviteNewProfileName", () => {
  it("invita a guardar con otro nombre si el archivo tiene campos de más", () => {
    const mapping: ColumnMapping = {
      payer: "Titular",
      amount: "Importe",
      date: "Fecha",
      reference: "",
      extras: [],
    };
    const result = shouldInviteNewProfileName(CREDIT_HEADERS, mapping, { name: "Visa Crédito" });
    expect(result.invite).toBe(true);
    expect(result.unused).toEqual(["Comercio", "Autorización"]);
  });

  it("no invita si no hay perfil seleccionado", () => {
    const mapping: ColumnMapping = {
      payer: "Titular",
      amount: "Importe",
      date: "",
      reference: "",
      extras: [],
    };
    expect(shouldInviteNewProfileName(CREDIT_HEADERS, mapping, null).invite).toBe(false);
  });

  it("invita aunque el usuario ya haya mapeado los campos nuevos", () => {
    const mapping: ColumnMapping = {
      payer: "Titular",
      amount: "Importe",
      date: "Fecha",
      reference: "",
      extras: [
        { id: "e1", label: "Comercio", column: "Comercio" },
        { id: "e2", label: "Autorización", column: "Autorización" },
      ],
    };
    const result = shouldInviteNewProfileName(CREDIT_HEADERS, mapping, {
      name: "Visa Crédito",
      headers: ["Titular", "Importe", "Fecha"],
    });
    expect(result.invite).toBe(true);
    expect(result.unused).toEqual(["Comercio", "Autorización"]);
  });
});

describe("namesClash / mappingProfileId", () => {
  it("compara nombres sin mayúsculas", () => {
    expect(namesClash("Visa Crédito", "visa crédito")).toBe(true);
    expect(namesClash("Visa Crédito", "Visa Débito")).toBe(false);
  });

  it("genera un id estable", () => {
    expect(mappingProfileId("Visa Crédito")).toBe("visa_credito");
  });
});
