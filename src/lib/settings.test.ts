import { describe, expect, it } from "vitest";
import { clampCodeSize, CODE_SIZE_DEFAULT, CODE_SIZE_MAX, CODE_SIZE_MIN, DEFAULT_SETTINGS, nextCodeSize, parseSettings, runsOnPick } from "./settings";

describe("parseSettings", () => {
  it("senza nulla di salvato dà i predefiniti", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("")).toEqual(DEFAULT_SETTINGS);
  });
  it("legge un contenuto valido", () => {
    const s = { language: "it", theme: "dark", codeSize: 15, ignoreCase: true, ignoreWhitespace: "amount", algorithm: "histogram", dirFilter: "all", compareOnDrop: true, compareFilesOnDrop: false, systemTitleBar: true, dirStripes: false, compactToolbar: true };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });
  it("gli spazi: i vecchi sì/no restano validi, i livelli si leggono, il resto torna al predefinito", () => {
    expect(parseSettings(JSON.stringify({ ignoreWhitespace: true })).ignoreWhitespace).toBe("all");
    expect(parseSettings(JSON.stringify({ ignoreWhitespace: false })).ignoreWhitespace).toBe("none");
    for (const w of ["none", "trailing", "amount", "all"])
      expect(parseSettings(JSON.stringify({ ignoreWhitespace: w })).ignoreWhitespace).toBe(w);
    expect(parseSettings(JSON.stringify({ ignoreWhitespace: "boh" })).ignoreWhitespace).toBe("none");
    expect(DEFAULT_SETTINGS.ignoreWhitespace).toBe("none");
  });
  it("contenuti rovinati danno i predefiniti", () => {
    expect(parseSettings("{non json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("42")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
  });
  it("un valore non valido torna al predefinito senza toccare gli altri", () => {
    const text = JSON.stringify({ theme: "blu", codeSize: "grande", ignoreCase: 1, dirFilter: "all" });
    expect(parseSettings(text)).toEqual({ ...DEFAULT_SETTINGS, dirFilter: "all" });
  });
  it("la lingua: «auto», un codice valido; il resto torna a «auto»", () => {
    expect(parseSettings(JSON.stringify({ language: "en" })).language).toBe("en");
    expect(parseSettings(JSON.stringify({ language: "pt-BR" })).language).toBe("pt-BR");
    expect(parseSettings(JSON.stringify({ language: "../x" })).language).toBe("auto");
    expect(parseSettings(JSON.stringify({ language: 3 })).language).toBe("auto");
  });
  it("la dimensione del testo si riporta nei limiti", () => {
    expect(parseSettings(JSON.stringify({ codeSize: 99 })).codeSize).toBe(16);
    expect(parseSettings(JSON.stringify({ codeSize: 2 })).codeSize).toBe(11);
    expect(parseSettings(JSON.stringify({ codeSize: 13.6 })).codeSize).toBe(14);
  });
});

describe("clampCodeSize", () => {
  it("limita e arrotonda", () => {
    expect(clampCodeSize(10)).toBe(11);
    expect(clampCodeSize(17)).toBe(16);
    expect(clampCodeSize(12.4)).toBe(12);
  });
});

describe("nextCodeSize", () => {
  it("più grande e più piccola di un passo, senza uscire dai limiti; «normale» torna al predefinito", () => {
    expect(nextCodeSize(13, "bigger")).toBe(14);
    expect(nextCodeSize(13, "smaller")).toBe(12);
    expect(nextCodeSize(CODE_SIZE_MAX, "bigger")).toBe(CODE_SIZE_MAX);
    expect(nextCodeSize(CODE_SIZE_MIN, "smaller")).toBe(CODE_SIZE_MIN);
    expect(nextCodeSize(CODE_SIZE_MAX, "reset")).toBe(CODE_SIZE_DEFAULT);
  });
});

describe("elenco delle cartelle", () => {
  it("di norma mostra tutte le voci", () => {
    expect(DEFAULT_SETTINGS.dirFilter).toBe("all");
  });
});

describe("compareFilesOnDrop", () => {
  it("di norma i file si confrontano subito, le cartelle no", () => {
    expect(DEFAULT_SETTINGS.compareFilesOnDrop).toBe(true);
    expect(runsOnPick(DEFAULT_SETTINGS, "files")).toBe(true);
    expect(runsOnPick(DEFAULT_SETTINGS, "dirs")).toBe(false);
    expect(parseSettings(JSON.stringify({ compareFilesOnDrop: false })).compareFilesOnDrop).toBe(false);
    expect(parseSettings(JSON.stringify({ compareFilesOnDrop: 1 })).compareFilesOnDrop).toBe(true);
  });
});

describe("compareOnDrop", () => {
  it("è disattivato di norma e si legge dal salvataggio", () => {
    expect(DEFAULT_SETTINGS.compareOnDrop).toBe(false);
    expect(parseSettings(JSON.stringify({ compareOnDrop: true })).compareOnDrop).toBe(true);
    expect(parseSettings(JSON.stringify({ compareOnDrop: "sì" })).compareOnDrop).toBe(false);
  });
});

describe("algorithm", () => {
  it("il predefinito è Myers e si leggono solo i valori noti", () => {
    expect(DEFAULT_SETTINGS.algorithm).toBe("myers");
    expect(parseSettings(JSON.stringify({ algorithm: "patience" })).algorithm).toBe("patience");
    expect(parseSettings(JSON.stringify({ algorithm: "histogram" })).algorithm).toBe("histogram");
    expect(parseSettings(JSON.stringify({ algorithm: "lcs" })).algorithm).toBe("myers");
    expect(parseSettings(JSON.stringify({ algorithm: 3 })).algorithm).toBe("myers");
  });
});

describe("dirStripes", () => {
  it("è attivo di default e si legge solo se booleano", () => {
    expect(DEFAULT_SETTINGS.dirStripes).toBe(true);
    expect(parseSettings(JSON.stringify({ dirStripes: false })).dirStripes).toBe(false);
    expect(parseSettings(JSON.stringify({ dirStripes: 0 })).dirStripes).toBe(true);
  });
});

describe("systemTitleBar", () => {
  it("è disattivata di default e vale solo se booleana", () => {
    expect(DEFAULT_SETTINGS.systemTitleBar).toBe(false);
    expect(parseSettings(JSON.stringify({ systemTitleBar: true })).systemTitleBar).toBe(true);
    expect(parseSettings(JSON.stringify({ systemTitleBar: 1 })).systemTitleBar).toBe(false);
  });
});
