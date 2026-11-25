import pkg from "../package.json";

export interface Camera {
  id: string;
  carretera: string;
  pk: string;
  sentido: string;
  provincia: string;
  fecha: string;
  imagen: string;
  latitud: string;
  longitud: string;
}

const CATALOG_URL = "https://www.dgt.es/.content/.assets/json/camaras.json";

// A hung DGT/GitHub connection must never block the UI forever.
const FETCH_TIMEOUT_MS = 10_000;

function get(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

// Catalog pk values use a decimal comma ("123,4"); some fields arrive as numbers.
export function pkValue(pk: string | number): number {
  return parseFloat(String(pk).replace(",", "."));
}

export function parseCatalog(data: { camaras: Camera[] }): Camera[] {
  // Catalog mixes "2" and "02" province codes; normalize to 2 digits
  for (const c of data.camaras) c.provincia = String(c.provincia).padStart(2, "0");
  return data.camaras;
}

export async function fetchAllCameras(): Promise<Camera[]> {
  const res = await get(CATALOG_URL);
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  return parseCatalog(await res.json() as { camaras: Camera[] });
}

export function filterCameras(all: Camera[], prov: string, carr: string): Camera[] {
  return all.filter((c) => c.carretera === carr && (prov === "*" || c.provincia === prov));
}

// INE province codes
export const PROVINCES: Record<string, string> = {
  "01": "Álava", "02": "Albacete", "03": "Alicante", "04": "Almería", "05": "Ávila",
  "06": "Badajoz", "07": "Baleares", "08": "Barcelona", "09": "Burgos", "10": "Cáceres",
  "11": "Cádiz", "12": "Castellón", "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña",
  "16": "Cuenca", "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Guipúzcoa",
  "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León", "25": "Lleida",
  "26": "La Rioja", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia",
  "31": "Navarra", "32": "Ourense", "33": "Asturias", "34": "Palencia", "35": "Las Palmas",
  "36": "Pontevedra", "37": "Salamanca", "38": "Tenerife", "39": "Cantabria", "40": "Segovia",
  "41": "Sevilla", "42": "Soria", "43": "Tarragona", "44": "Teruel", "45": "Toledo",
  "46": "Valencia", "47": "Valladolid", "48": "Bizkaia", "49": "Zamora", "50": "Zaragoza",
  "51": "Ceuta", "52": "Melilla",
};

export function provinceName(code: string): string {
  return PROVINCES[code] ?? code;
}

// DGT mixes bilingual official names ("Alacant/Alicante") with the Spanish one,
// and a few pairs share no word at all ("Illes Balears" / "Baleares").
export const PROVINCE_ALIASES: Record<string, string[]> = {
  "01": ["araba", "alava"],
  "07": ["illes balears", "balears", "baleares"],
  "15": ["a coruna", "la coruna"],
  "17": ["girona", "gerona"],
  "20": ["gipuzkoa", "guipuzcoa"],
  "25": ["lleida", "lerida"],
  "32": ["ourense", "orense"],
  "48": ["bizkaia", "vizcaya"],
};

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// The feed sends the province either as an INE code or as a plain name, and both
// sides may use a bilingual or alternate spelling. Never hide an incident just
// because its province could not be matched confidently.
export function sameProvince(incidentProvince: string, code: string): boolean {
  const p = fold(incidentProvince);
  if (!p) return true;
  const candidates = new Set([fold(code), fold(provinceName(code)), ...(PROVINCE_ALIASES[code] ?? []).map(fold)]);
  if (candidates.has(p)) return true;
  // "Alacant/Alicante" → either half is a valid spelling of the same province
  for (const part of p.split("/").map(fold)) {
    if (candidates.has(part)) return true;
  }
  // "Santa Cruz de Tenerife" / "Tenerife", "Castelló/Castellón" and friends
  return [...candidates].some((c) => c.length > 3 && (p.includes(c) || c.includes(p)));
}

export interface Incident {
  road: string;
  pk: string;
  province: string;
  label: string;
  lat: string;
  lon: string;
}

const INCIDENCES_URL =
  "https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml";

const LABELS: Record<string, string> = {
  roadworks: "obras",
  newRoadworksLayout: "obras (nuevo trazado)",
  laneClosures: "cierre de carril",
  vehicleObstruction: "vehículo detenido",
  singleAlternateLineTraffic: "regulación alterna de carril",
  carriagewayClosures: "cierre de calzada",
  obstructionOnTheRoad: "obstáculo en la calzada",
  narrowLanes: "carriles estrechos",
  obstruction: "obstáculo",
  objectOnTheRoad: "objeto en la calzada",
  environmentalObstruction: "obstáculo medioambiental",
  roadClosed: "calzada cerrada",
  accident: "accidente",
  speedRestrictionInOperation: "limitación de velocidad",
  weightRestrictionInOperation: "restricción por peso",
  intermittentShortTermClosures: "cierres intermitentes",
  lanesDeviated: "desvío de carriles",
  abnormalTraffic: "tráfico anormal",
  spillageOnTheRoad: "vertido",
  shedLoad: "carga caída",
  poorEnvironment: "mala visibilidad",
  other: "incidencia",
  roadMaintenance: "obras",
  roadClosedGeneral: "calzada cerrada",
  // Types seen in the live feed that used to be shown in English
  slowTraffic: "tráfico lento",
  heavyTraffic: "tráfico intenso",
  doNotUseSpecifiedLanesOrCarriageways: "carriles no utilizables",
  useOfSpecifiedLanesOrCarriagewaysAllowed: "carriles habilitados",
  infrastructureDamageObstruction: "daños en la infraestructura",
};

// Namespace prefixes in the DGT feeds are not contractual: match any prefix.
// Regexes are built once instead of per record.
const tagRes = new Map<string, RegExp>();

// \b stops "predefinedLocation" from matching "predefinedLocationName".
// Self-closing elements carry no data and are skipped by design.
function elements(xml: string, tag: string): string[] {
  let re = tagRes.get(`<${tag}`);
  if (!re) {
    re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}\\s*>`, "g");
    tagRes.set(`<${tag}`, re);
  }
  return [...xml.matchAll(re)].map((m) => m[1]);
}

// Tolerates a namespace prefix, attributes on the tag (`<roadName xml:lang="es">`)
// and CDATA-wrapped text.
function first(text: string, tag: string): string {
  let re = tagRes.get(tag);
  if (!re) {
    re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>(?:<!\\[CDATA\\[)?([^<]*)`);
    tagRes.set(tag, re);
  }
  const m = text.match(re);
  return m ? m[1].replace(/\]\]>$/, "").trim() : "";
}

function labelFor(text: string): string {
  const raw =
    first(text, "obstructionType") ||
    first(text, "roadOrCarriagewayOrLaneManagementType") ||
    first(text, "roadConditionType") ||
    first(text, "speedManagementType") ||
    first(text, "abnormalTrafficType") ||
    first(text, "causeType");
  return LABELS[raw] ?? raw;
}

export function parseIncidents(xml: string): Incident[] {
  const out: Incident[] = [];
  for (const text of elements(xml, "situationRecord")) {
    const road = first(text, "roadName");
    if (!road) continue;
    out.push({
      road,
      pk: first(text, "kilometerPoint"),
      province: first(text, "province"),
      label: labelFor(text),
      lat: first(text, "latitude"),
      lon: first(text, "longitude"),
    });
  }
  return out;
}

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await get(INCIDENCES_URL);
  if (!res.ok) throw new Error(`Incidents fetch failed: ${res.status}`);
  return parseIncidents(await res.text());
}

// ---- Radares fijos (static DATEX II v1.0 inventory) ----

export interface Radar {
  road: string;
  pk: number;
  sentido: string;
}

const RADARS_URL =
  "https://infocar.dgt.es/datex2/dgt/PredefinedLocationsPublication/radares/content.xml";

export function parseRadars(xml: string): Radar[] {
  const out: Radar[] = [];
  for (const text of elements(xml, "predefinedLocation")) {
    const road = first(text, "roadNumber");
    const dist = first(text, "referencePointDistance");
    if (!road || !dist) continue;
    // DATEX reference points are metres; the camera list works in kilometres.
    const pk = pkValue(dist) / 1000;
    if (!Number.isFinite(pk)) continue;
    const dir = first(text, "directionRelative");
    out.push({ road, pk, sentido: dir === "negative" ? "-" : "+" });
  }
  return out;
}

export async function fetchRadars(): Promise<Radar[]> {
  const res = await get(RADARS_URL);
  if (!res.ok) throw new Error(`Radars fetch failed: ${res.status}`);
  return parseRadars(await res.text());
}

// ---- Tráfico TomTom (opcional; requiere TOMTOM_KEY en el entorno) ----

export interface Traffic {
  currentSpeed: number;
  freeFlowSpeed: number;
  closed: boolean;
}

// cache keyed by rounded point, ~2 min TTL (TomTom flow data updates each minute)
const trafficCache = new Map<string, { t: number; v: Traffic | null }>();
const TRAFFIC_TTL_MS = 2 * 60 * 1000;

export function tomtomEnabled(): boolean {
  return Boolean(process.env.TOMTOM_KEY);
}

export async function fetchTraffic(lat: number, lon: number): Promise<Traffic | null> {
  const key = process.env.TOMTOM_KEY;
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = trafficCache.get(cacheKey);
  if (hit && Date.now() - hit.t < TRAFFIC_TTL_MS) return hit.v;
  const url =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
    `?key=${key}&point=${lat.toFixed(5)},${lon.toFixed(5)}`;
  try {
    const res = await get(url);
    if (!res.ok) throw new Error(`Traffic fetch failed: ${res.status}`);
    const data = (await res.json()) as {
      flowSegmentData?: {
        currentSpeed: number;
        freeFlowSpeed: number;
        roadClosure: boolean;
      };
    };
    const f = data.flowSegmentData;
    if (!f) throw new Error("no flow data");
    if (!Number.isFinite(f.currentSpeed) || !Number.isFinite(f.freeFlowSpeed)) {
      throw new Error("incomplete flow data");
    }
    const v: Traffic = {
      currentSpeed: f.currentSpeed,
      freeFlowSpeed: f.freeFlowSpeed,
      closed: Boolean(f.roadClosure),
    };
    trafficCache.set(cacheKey, { t: Date.now(), v });
    return v;
  } catch {
    trafficCache.set(cacheKey, { t: Date.now(), v: null });
    return null;
  }
}

// ---- Update check (GitHub latest release) ----

const REPO = "mjimeneznet/dgtui";

// Single source of truth: package.json. The release workflow tags from it.
export const APP_VERSION: string = pkg.version;

export async function latestVersion(): Promise<string | null> {
  try {
    const res = await get(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    const tag = data.tag_name?.replace(/^v/, "").trim();
    return tag || null;
  } catch {
    return null;
  }
}

export function semverLess(a: string, b: string): boolean {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}

export async function checkUpdate(): Promise<string | null> {
  const latest = await latestVersion();
  return latest && semverLess(APP_VERSION, latest) ? latest : null;
}
