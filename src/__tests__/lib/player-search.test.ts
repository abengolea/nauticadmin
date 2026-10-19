import { describe, expect, it } from "vitest";
import { playerMatchesSearch, playerSearchHaystack } from "@/lib/player-search";

const player = {
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana.perez@gmail.com",
  dni: "30111222",
  cuit: "27-30111222-3",
  ubicacion: "Muelle 4",
  tutorContact: { name: "Luis Pérez", phone: "3364 555111" },
  embarcaciones: [
    { nombre: "Santa María", matricula: "AR-1234-A" },
  ],
};

describe("playerSearchHaystack", () => {
  it("incluye nombre, mail, barco y matrícula", () => {
    const haystack = playerSearchHaystack(player);
    expect(haystack).toContain("ana.perez@gmail.com");
    expect(haystack).toContain("Santa María");
    expect(haystack).toContain("AR-1234-A");
    expect(haystack.toLowerCase()).toContain("perez");
  });
});

describe("playerMatchesSearch", () => {
  it("encuentra por mail, matrícula y nombre de embarcación", () => {
    expect(playerMatchesSearch(player, "ana.perez@gmail.com")).toBe(true);
    expect(playerMatchesSearch(player, "AR-1234-A")).toBe(true);
    expect(playerMatchesSearch(player, "santa maria")).toBe(true);
    expect(playerMatchesSearch(player, "muelle 4")).toBe(true);
    expect(playerMatchesSearch(player, "3364 555111")).toBe(true);
  });

  it("no matchea un texto que no está en la ficha", () => {
    expect(playerMatchesSearch(player, "inexistente")).toBe(false);
  });
});
