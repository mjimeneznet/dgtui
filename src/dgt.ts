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

export async function fetchAllCameras(): Promise<Camera[]> {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  const data = await res.json() as { camaras: Camera[] };
  // Catalog mixes "2" and "02" province codes; normalize to 2 digits
  for (const c of data.camaras) c.provincia = c.provincia.padStart(2, "0");
  return data.camaras;
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
};

function first(text: string, tag: string): string {
  const m = text.match(new RegExp(`<${tag}>([^<]+)<`));
  return m ? m[1] : "";
}

function labelFor(text: string): string {
  const raw =
    first(text, "sit:obstructionType") ||
    first(text, "sit:roadOrCarriagewayOrLaneManagementType") ||
    first(text, "sit:roadConditionType") ||
    first(text, "sit:speedManagementType") ||
    first(text, "sit:abnormalTrafficType") ||
    first(text, "sit:causeType");
  return LABELS[raw] ?? raw;
}

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch(INCIDENCES_URL);
  if (!res.ok) throw new Error(`Incidents fetch failed: ${res.status}`);
  const xml = await res.text();
  const out: Incident[] = [];
  for (const rec of xml.split("<sit:situationRecord ").slice(1)) {
    const text = rec.slice(0, rec.indexOf("</sit:situationRecord>"));
    const road = first(text, "loc:roadName");
    if (!road) continue;
    out.push({
      road,
      pk: first(text, "lse:kilometerPoint"),
      province: first(text, "lse:province"),
      label: labelFor(text),
      lat: first(text, "loc:latitude"),
      lon: first(text, "loc:longitude"),
    });
  }
  return out;
}

// ---- Radares fijos (static DATEX II v1.0 inventory) ----

export interface Radar {
  road: string;
  pk: number;
  sentido: string;
}

const RADARS_URL =
  "https://infocar.dgt.es/datex2/dgt/PredefinedLocationsPublication/radares/content.xml";

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
    const res = await fetch(url);
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

export async function fetchRadars(): Promise<Radar[]> {
  const res = await fetch(RADARS_URL);
  if (!res.ok) throw new Error(`Radars fetch failed: ${res.status}`);
  const xml = await res.text();
  const out: Radar[] = [];
  for (const rec of xml.split("<_0:predefinedLocation ").slice(1)) {
    const text = rec.slice(0, rec.indexOf("</_0:predefinedLocation>"));
    const road = text.match(/<_0:roadNumber>([^<]+)</)?.[1] ?? "";
    const dist = text.match(/<_0:referencePointDistance>([^<]+)</)?.[1] ?? "";
    if (!road || !dist) continue;
    const pk = parseFloat(dist) / 1000;
    if (!Number.isFinite(pk)) continue;
    const dir = text.match(/<_0:directionRelative>([^<]+)</)?.[1] ?? "";
    out.push({ road, pk, sentido: dir === "negative" ? "-" : "+" });
  }
  return out;
}
// ---- Update check (GitHub latest release) ----

const REPO = "mjimeneznet/dgtui";

export async function latestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    const tag = data.tag_name?.replace(/^v/, "");
    return tag || null;
  } catch {
    return null;
  }
}

function semverLess(a: string, b: string): boolean {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pb[i] ?? 0) > (pa[i] ?? 0)) return true;
    if ((pb[i] ?? 0) < (pa[i] ?? 0)) return false;
  }
  return false;
}

const APP_VERSION = "0.2.1";

export async function checkUpdate(): Promise<string | null> {
  const latest = await latestVersion();
  return latest && semverLess(APP_VERSION, latest) ? latest : null;
}
