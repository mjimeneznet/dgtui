import { describe, expect, test } from "bun:test";
import {
  filterCameras,
  parseCatalog,
  parseIncidents,
  parseRadars,
  pkValue,
  provinceName,
  sameProvince,
  semverLess,
  type Camera,
} from "./dgt";

const cam = (over: Partial<Camera>): Camera => ({
  id: "1",
  carretera: "A-42",
  pk: "10",
  sentido: "+",
  provincia: "28",
  fecha: "",
  imagen: "",
  latitud: "40,1",
  longitud: "-3,7",
  ...over,
});

describe("catalog", () => {
  test("pads mixed province codes to two digits", () => {
    const cams = parseCatalog({ camaras: [cam({ provincia: "2" }), cam({ provincia: "28" })] });
    expect(cams.map((c) => c.provincia)).toEqual(["02", "28"]);
  });

  // The JSON has shipped province as a number too.
  test("coerces a numeric province before padding it", () => {
    const cams = parseCatalog({ camaras: [{ provincia: 2 } as unknown as Camera] });
    expect(cams[0].provincia).toBe("02");
  });

  test("filters by road and province, with * meaning all provinces", () => {
    const all = [cam({}), cam({ provincia: "45" }), cam({ carretera: "A-4" })];
    expect(filterCameras(all, "28", "A-42")).toHaveLength(1);
    expect(filterCameras(all, "*", "A-42")).toHaveLength(2);
  });
});

describe("pkValue", () => {
  test("accepts decimal comma and plain numbers", () => {
    expect(pkValue("123,4")).toBe(123.4);
    expect(pkValue("123.4")).toBe(123.4);
    expect(pkValue(12)).toBe(12);
  });

  test("yields NaN for a non numeric pk", () => {
    expect(pkValue("")).toBeNaN();
  });
});

describe("sameProvince", () => {
  test("matches INE code, province name and empty feed value", () => {
    expect(sameProvince("28", "28")).toBe(true);
    expect(sameProvince("Madrid", "28")).toBe(true);
    expect(sameProvince("28", "45")).toBe(false);
    expect(sameProvince("", "28")).toBe(true);
  });

  // These are the spellings the live DGT feed actually uses.
  test("matches the bilingual names published by DGT", () => {
    expect(sameProvince("Alacant/Alicante", "03")).toBe(true);
    expect(sameProvince("Castelló/Castellón", "12")).toBe(true);
    expect(sameProvince("València/Valencia", "46")).toBe(true);
    expect(sameProvince("Illes Balears", "07")).toBe(true);
    expect(sameProvince("Santa Cruz de Tenerife", "38")).toBe(true);
    expect(sameProvince("Vizcaya", "48")).toBe(true);
    expect(sameProvince("Gipuzkoa", "20")).toBe(true);
    expect(sameProvince("Araba", "01")).toBe(true);
  });

  test("does not match a different province", () => {
    expect(sameProvince("Toledo", "28")).toBe(false);
    expect(sameProvince("Sevilla", "29")).toBe(false);
    expect(sameProvince("Alacant/Alicante", "12")).toBe(false);
  });

  test("provinceName falls back to the code", () => {
    expect(provinceName("28")).toBe("Madrid");
    expect(provinceName("99")).toBe("99");
  });
});

// Namespace prefixes are not contractual: the feeds have used sit:/_0:/_1:.
describe("incidents", () => {
  const xml = `<?xml version="1.0"?>
  <d2:payload>
    <sit:situationRecord id="1">
      <sit:cause><sit:causeType>accident</sit:causeType></sit:cause>
      <loc:location><loc:roadName>A-42</loc:roadName>
        <lse:kilometerPoint>12,5</lse:kilometerPoint>
        <lse:province>28</lse:province>
        <loc:latitude>40,1</loc:latitude><loc:longitude>-3,7</loc:longitude>
      </loc:location>
    </sit:situationRecord>
    <sit:situationRecord id="2">
      <sit:cause><sit:causeType>accident</sit:causeType></sit:cause>
      <loc:location><lse:kilometerPoint>500</lse:kilometerPoint></loc:location>
    </sit:situationRecord>
    <sit:situationRecord id="3"/>
    <sit:situationRecord id="4">
      <sit:cause><sit:causeType>roadworks</sit:causeType></sit:cause>
      <loc:location><loc:roadName>A-6</loc:roadName></loc:location>
    </sit:situationRecord>
    <sit:situationRecord id="5">
      <sit:cause><sit:causeType>someFutureType</sit:causeType></sit:cause>
      <loc:location><loc:roadName>A-7</loc:roadName></loc:location>
    </sit:situationRecord>
  </d2:payload>`;

  test("parses fields, maps labels and skips records without a road", () => {
    const inc = parseIncidents(xml);
    expect(inc.map((i) => i.road)).toEqual(["A-42", "A-6", "A-7"]);
    expect(inc[0]).toMatchObject({ pk: "12,5", province: "28", label: "accidente", lat: "40,1" });
  });

  test("maps a known cause to its Spanish label", () => {
    expect(parseIncidents(xml)[1].label).toBe("obras");
  });

  // These five are the types the live feed actually returns untranslated.
  test("translates every type observed in the live feed", () => {
    const cases: Array<[string, string]> = [
      ["slowTraffic", "tráfico lento"],
      ["heavyTraffic", "tráfico intenso"],
      ["doNotUseSpecifiedLanesOrCarriageways", "carriles no utilizables"],
      ["useOfSpecifiedLanesOrCarriagewaysAllowed", "carriles habilitados"],
      ["infrastructureDamageObstruction", "daños en la infraestructura"],
    ];
    for (const [raw, label] of cases) {
      const one = `<sit:situationRecord id="1"><sit:cause><sit:causeType>${raw}</sit:causeType></sit:cause>
        <loc:location><loc:roadName>A-42</loc:roadName></loc:location></sit:situationRecord>`;
      expect(parseIncidents(one)[0]?.label).toBe(label);
    }
  });

  test("keeps an unknown type verbatim instead of dropping the record", () => {
    expect(parseIncidents(xml)[2].label).toBe("someFutureType");
  });

  test("still parses when the namespace prefix changes", () => {
    const other = xml.replaceAll("sit:", "_1:").replaceAll("d2:", "_2:");
    expect(parseIncidents(other).map((i) => i.road)).toEqual(["A-42", "A-6", "A-7"]);
  });

  test("returns nothing for a non DATEX body", () => {
    expect(parseIncidents("<html><body>maintenance</body></html>")).toEqual([]);
  });

  test("tolerates attributes on the field tag and CDATA text", () => {
    const one = `<sit:situationRecord id="1"><loc:location>
      <loc:roadName xml:lang="es"><![CDATA[A-42]]></loc:roadName>
      <lse:kilometerPoint>12,5</lse:kilometerPoint></loc:location></sit:situationRecord>`;
    expect(parseIncidents(one)[0]).toMatchObject({ road: "A-42", pk: "12,5" });
  });
});

describe("radars", () => {
  const xml = `<d2:payload>
    <_0:predefinedLocation id="1">
      <_0:predefinedLocationName><values><_0:value>R1</_0:value></values></_0:predefinedLocationName>
      <loc:location><loc:roadNumber>A-42</loc:roadNumber>
        <_0:referencePointDistance>12500</_0:referencePointDistance>
        <_0:directionRelative>negative</_0:directionRelative>
      </loc:location>
    </_0:predefinedLocation>
    <_0:predefinedLocation id="2">
      <loc:location><loc:roadNumber>A-4</loc:roadNumber>
        <_0:referencePointDistance>3000</_0:referencePointDistance>
        <_0:directionRelative>positive</_0:directionRelative>
      </loc:location>
    </_0:predefinedLocation>
    <_0:predefinedLocation id="3">
      <loc:location><loc:roadNumber></loc:roadNumber></loc:location>
    </_0:predefinedLocation>
  </d2:payload>`;

  test("converts metres to km and keeps the direction", () => {
    const radars = parseRadars(xml);
    expect(radars).toEqual([
      { road: "A-42", pk: 12.5, sentido: "-" },
      { road: "A-4", pk: 3, sentido: "+" },
    ]);
  });

  test("survives a renamed namespace prefix", () => {
    expect(parseRadars(xml.replaceAll("_0:", "_9:"))).toHaveLength(2);
  });
});

describe("semverLess", () => {
  test("compares numerically, not lexically", () => {
    expect(semverLess("0.2.1", "0.10.0")).toBe(true);
    expect(semverLess("0.9.0", "0.10.0")).toBe(true);
    expect(semverLess("0.2.1", "0.2.1")).toBe(false);
    expect(semverLess("1.0.0", "0.9.9")).toBe(false);
    expect(semverLess("0.2.1", "0.2.2")).toBe(true);
  });

  test("treats missing or malformed segments as zero", () => {
    expect(semverLess("0.2", "0.2.1")).toBe(true);
    expect(semverLess("0.2.1", "x.y.z")).toBe(false);
  });
});
