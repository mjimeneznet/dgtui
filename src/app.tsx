import React, { useEffect, useMemo, useState } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { fetchAllCameras, fetchIncidents, fetchRadars, fetchTraffic, tomtomEnabled, filterCameras, provinceName, type Camera, type Incident, type Radar, type Traffic } from "./dgt";

interface Props {
  prov: string;
  carr: string;
  intervalSec: number;
}

function fmtCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function App({ prov: initialProv, carr: initialCarr, intervalSec }: Props) {
  const [all, setAll] = useState<Camera[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [radars, setRadars] = useState<Radar[]>([]);
  const [traffic, setTraffic] = useState<Traffic | null>(null);
  const [incScroll, setIncScroll] = useState(0);
  const [prov, setProv] = useState(initialProv);
  const [carr, setCarr] = useState(initialCarr);
  const [selected, setSelected] = useState(0);
  const [picker, setPicker] = useState(false);
  const [pickProv, setPickProv] = useState(initialProv);
  const [pickMode, setPickMode] = useState<"provroad" | "roadonly">("provroad");
  const [pickPane, setPickPane] = useState<"prov" | "road">("prov");
  const [provIdx, setProvIdx] = useState(0);
  const [roadIdx, setRoadIdx] = useState(0);
  const renderer = useRenderer();
  const dims = useTerminalDimensions();
  const [tick, setTick] = useState(0);
  const [countdown, setCountdown] = useState(intervalSec);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const cameras = useMemo(
    () => filterCameras(all, prov, carr).sort((a, b) => parseFloat(a.pk) - parseFloat(b.pk)),
    [all, prov, carr],
  );

  const roads = useMemo(
    () => [...new Set(all.filter((c) => c.provincia === pickProv).map((c) => c.carretera))].sort(),
    [all, pickProv],
  );

  const provinces = useMemo(
    () => [...new Set(all.map((c) => c.provincia))].sort(),
    [all],
  );

  const allRoads = useMemo(
    () => [...new Set(all.map((c) => c.carretera))].sort(),
    [all],
  );

  const winSize = Math.max(10, Math.floor(dims.height * 0.8) - 6);
  const provWindow = (list: unknown[], idx: number) => {
    const start = Math.max(0, idx - Math.floor(winSize / 2));
    return list.slice(start, start + winSize).map((item, k) => ({ item: item as string, i: start + k }));
  };
  const camListSize = Math.max(4, dims.height - 8);
  type ListItem =
    | { kind: "cam"; pk: number; origIdx: number; cam: Camera }
    | { kind: "radar"; pk: number; radar: Radar }
    | { kind: "incident"; pk: number; inc: Incident };
  const listItems = useMemo(
    () =>
      [
        ...cameras.map((c, origIdx): ListItem => ({ kind: "cam", pk: parseFloat(String(c.pk).replace(",", ".")), origIdx, cam: c })),
        ...(() => {
          const pks = cameras.map((c) => parseFloat(String(c.pk).replace(",", ".")));
          if (!pks.length) return [];
          const lo = Math.min(...pks), hi = Math.max(...pks);
          const after = radars
            .filter((r) => r.road === carr && r.pk > hi)
            .sort((a, b) => a.pk - b.pk)[0];
          return radars
            .filter((r) => r.road === carr && r.pk >= lo && r.pk <= (after?.pk ?? hi))
            .map((r): ListItem => ({ kind: "radar", pk: r.pk, radar: r }));
        })(),
        ...(() => {
          const pks = cameras.map((c) => parseFloat(String(c.pk).replace(",", ".")));
          if (!pks.length) return [];
          const hi = Math.max(...pks);
          return incidents
            .filter((n) => n.road === carr && Number.isFinite(parseFloat(String(n.pk).replace(",", "."))) && parseFloat(String(n.pk).replace(",", ".")) <= hi)
            .map((n): ListItem => ({ kind: "incident", pk: parseFloat(String(n.pk).replace(",", ".")), inc: n }));
        })(),
      ].sort((a, b) => a.pk - b.pk),
    [cameras, radars, incidents, carr],
  );
  const camWindow = (idx: number) => {
    const start = Math.max(0, Math.min(idx - Math.floor(camListSize / 2), Math.max(0, listItems.length - camListSize)));
    return listItems.slice(start, start + camListSize).map((it, k) => ({ item: it, i: start + k }));
  };

  const reload = () => {
    setAll([]);
    fetchAllCameras()
      .then((c) => {
        setAll(c);
        setLastUpdate(new Date());
        setTick((t) => t + 1);
        setCountdown(intervalSec);
      })
      .catch((e) => setError(String(e)));
    fetchIncidents().then(setIncidents).catch(() => setIncidents([]));
  };

  useEffect(() => {
    fetchAllCameras()
      .then((c) => {
        setAll(c);
        setLastUpdate(new Date());
      })
      .catch((e) => setError(String(e)));
    fetchIncidents().then(setIncidents).catch(() => setIncidents([]));
    fetchRadars().then(setRadars).catch(() => setRadars([]));
  }, []);

  useEffect(() => {
    setSelected(0);
    setIncScroll(0);
  }, [prov, carr]);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchAllCameras()
            .then((c2) => {
              setAll(c2);
              setLastUpdate(new Date());
              setTick((t) => t + 1);
            })
            .catch((e) => setError(String(e)));
              fetchIncidents().then(setIncidents).catch(() => setIncidents([]));
          return intervalSec;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [intervalSec]);

  useKeyboard((key) => {
    if (picker) {
      if (key.name === "escape") setPicker(false);
      else if (pickMode === "roadonly") {
        if (key.name === "up") setRoadIdx((i) => Math.max(0, i - 1));
        else if (key.name === "down") setRoadIdx((i) => Math.min(allRoads.length - 1, i + 1));
        else if (key.name === "return" || key.name === "enter") {
          setProv("*");
          setCarr(allRoads[roadIdx] ?? "");
          setPicker(false);
          reload();
        }
      } else {
        if (key.name === "left" || key.name === "tab") setPickPane("prov");
        else if (key.name === "right") setPickPane("road");
        else if (key.name === "up") {
          if (pickPane === "prov") {
            setProvIdx((i) => {
              const ni = Math.max(0, i - 1);
              setPickProv(provinces[ni]);
              setRoadIdx(0);
              return ni;
            });
          } else setRoadIdx((i) => Math.max(0, i - 1));
        } else if (key.name === "down") {
          if (pickPane === "prov") {
            setProvIdx((i) => {
              const ni = Math.min(provinces.length - 1, i + 1);
              setPickProv(provinces[ni]);
              setRoadIdx(0);
              return ni;
            });
          } else setRoadIdx((i) => Math.min(roads.length - 1, i + 1));
        } else if (key.name === "return" || key.name === "enter") {
          if (pickPane === "prov") {
            setPickPane("road");
          } else {
            setProv(pickProv);
            setCarr(roads[roadIdx] ?? "");
            setPicker(false);
            reload();
          }
        }
      }
      return;
    }
    if (key.name === "p") {
      setPickMode("provroad");
      setPickProv(prov === "*" ? "28" : prov);
      setProvIdx(provinces.indexOf(prov === "*" ? "28" : prov));
      setRoadIdx(roads.indexOf(carr));
      setPickPane("prov");
      setPicker(true);
    } else if (key.name === "c") {
      setPickMode("roadonly");
      setRoadIdx(allRoads.indexOf(carr));
      setPicker(true);
    } else if (key.name === "down" || key.name === "up") {
      const dir = key.name === "down" ? 1 : -1;
      const cur = listItems.findIndex((it) => it.kind === "cam" && it.origIdx === selected);
      const next = [...listItems.slice(cur + 1), ...listItems.slice(0, Math.max(0, cur))];
      const target = (dir === 1 ? next.find((it) => it.kind === "cam") : [...next].reverse().find((it) => it.kind === "cam")) as { origIdx: number } | undefined;
      if (target) setSelected(target.origIdx);
    }
    else if (key.name === "j") setIncScroll((v) => Math.min(v + 1, incMax));
    else if (key.name === "k") setIncScroll((v) => Math.max(v - 1, 0));
    else if (key.name === "r") reload();
    else if (key.name === "q") { renderer.destroy(); process.exit(0); }
  });

  const cam = cameras[selected];

  const camIncidents = useMemo(
    () => incidents.filter((i) => i.road === cam?.carretera),
    [incidents, cam],
  );
  const INC_VISIBLE = 4;
  const incMax = Math.max(0, camIncidents.length - INC_VISIBLE);
  const incOff = Math.min(incScroll, incMax);
  const incWin = camIncidents.slice(incOff, incOff + INC_VISIBLE);
  useEffect(() => {
    setTraffic(null);
    if (!tomtomEnabled() || !cam) return;
    const lat = parseFloat(String(cam.latitud).replace(",", "."));
    const lon = parseFloat(String(cam.longitud).replace(",", "."));
    let alive = true;
    fetchTraffic(lat, lon).then((t) => { if (alive) setTraffic(t); });
    return () => { alive = false; };
  }, [cam]);
  const url = cam ? `${cam.imagen}?t=${tick}-${selected}` : undefined;

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1}>
      <box flexDirection="row" justifyContent="space-between" height={1}>
        <text fg="cyan">DGTcams — cámaras de tráfico — {carr} ({prov === "*" ? "todas las provincias" : provinceName(prov)})</text>
        <text fg="gray">p provincia · c carretera · ↑/↓ navegar · r refrescar · q salir</text>
      </box>
      {error && <text fg="red">Error: {error}</text>}
      {!all.length && !error && <text>Cargando catálogo…</text>}
      <box flexDirection="row" flexGrow={1}>
        <box
          flexDirection="column"
          width={17}
          border
          borderStyle="single"
          borderColor="gray"
          title={cameras.length > camListSize ? `${selected + 1}/${cameras.length}` : undefined}
        >
          {camWindow(selected).map(({ item, i }) => {
            if (item.kind === "radar") {
              return (
                <text key={`r${i}-${item.pk}`} fg="yellow">
                    R {item.pk.toFixed(2).padStart(6)} {item.radar.sentido === "+" ? "↗" : "↘"}
                </text>
              );
            }            if (item.kind === "incident") {
              return (
                <text key={`n${i}-${item.pk}`} fg="red">
                  I {item.pk.toFixed(2).padStart(6)}
                </text>
              );
            }
            const isSel = item.origIdx === selected;
            return (
              <text
                key={item.cam.id}
                fg={isSel ? "black" : "white"}
                bg={isSel ? "cyan" : undefined}
              >
                {isSel ? "▸ " : "  "}
                pk {item.cam.pk.padStart(6)} {item.cam.sentido === "+" ? "↗" : "↘"}
              </text>
            );
          })}
        </box>
        <box flexGrow={1} border borderStyle="single" borderColor="cyan" flexDirection="column">
          {cam && (
            <>
              <text fg="yellow">
                {cam.carretera} pk {cam.pk} · cam {cam.id} · actualizada {cam.fecha}
              </text>
              {traffic && (
                <box height={1} width="100%">
                  {(() => {
                    const pct = Math.round((traffic.currentSpeed / traffic.freeFlowSpeed) * 100);
                    const fg = traffic.closed ? "red" : pct >= 80 ? "green" : pct >= 50 ? "yellow" : "red";
                    const txt = traffic.closed ? "Tráfico: calzada CORTADA" : `Tráfico: ${traffic.currentSpeed}/${traffic.freeFlowSpeed} km/h (${pct}%)`;
                    return <text fg={fg}>{txt}</text>;
                  })()}
                </box>
              )}
              <box flexGrow={1} alignItems="center" justifyContent="center">
                <image
                  key={url}
                  source={url}
                  fit="fit"
                  width="90%"
                  height="90%"
                  onError={(e: unknown) => setError(String(e))}
                />
              </box>
              <box
                  flexDirection="column"
                  flexGrow={1}
                  border
                  borderStyle="single"
                  borderColor={camIncidents.length ? "red" : "green"}
                title={
                  camIncidents.length > INC_VISIBLE
                    ? `Incidencias ${incOff + 1}-${Math.min(incOff + INC_VISIBLE, camIncidents.length)}/${camIncidents.length} · j/k`
                    : "Incidencias"
                }
                flexShrink={0}
              >
                {!camIncidents.length && (
                  <text fg="green">{cam.carretera}: Sin incidencias</text>
                )}
                {incWin.map((inc, i) => (
                  <text key={incOff + i} fg="red">
                    {inc.road} — {inc.label}
                    {inc.pk ? ` en el pk ${inc.pk}` : ""}
                    {inc.province ? ` (${inc.province})` : ""}
                  </text>
                ))}
              </box>
              <box flexDirection="row" justifyContent="flex-end">
                <text fg="gray">
                  {lastUpdate ? `actualizado ${lastUpdate.toLocaleTimeString()}` : "cargando…"} · refresco en {fmtCountdown(countdown)}
                </text>
              </box>
            </>
          )}
        </box>
      </box>

      {picker && (
        <box
          position="absolute"
          left="10%"
          top="10%"
          width="80%"
          height="80%"
          border
          borderStyle="double"
          borderColor="yellow"
          backgroundColor="black"
          flexDirection="row"
          title={pickMode === "roadonly"
            ? "↑/↓ mover · enter elegir · esc cerrar"
            : "↑/↓ mover · enter elegir · ←/→ cambiar columna · esc cerrar"}
        >
          {pickMode === "roadonly" ? (
            <box flexDirection="column" flexGrow={1} padding={1}>
              <text fg="yellow">Carretera (todas las provincias)</text>
              <box flexDirection="column" flexGrow={1}>
                {provWindow(allRoads, roadIdx).map(({ item: r, i }) => (
                  <text
                    key={r}
                    fg={i === roadIdx ? "black" : "white"}
                    bg={i === roadIdx ? "cyan" : undefined}
                  >
                    {i === roadIdx ? "▸ " : "  "}
                    {r}
                  </text>
                ))}
              </box>
            </box>
          ) : (
            <>
              <box flexDirection="column" width="50%" flexGrow={1} padding={1}>
                <text fg={pickPane === "prov" ? "yellow" : "gray"}>
                  {pickPane === "prov" ? "▸ Provincia" : "  Provincia"}
                </text>
                <box flexDirection="column" flexGrow={1}>
                  {provWindow(provinces, provIdx).map(({ item: p, i }) => (
                    <text
                      key={p}
                      fg={i === provIdx ? "black" : pickPane === "prov" ? "white" : "gray"}
                      bg={i === provIdx ? "cyan" : undefined}
                    >
                      {i === provIdx ? "▸ " : "  "}
                      {p} — {provinceName(p)}
                    </text>
                  ))}
                </box>
              </box>
              <box flexDirection="column" width="50%" flexGrow={1} padding={1}>
                <text fg={pickPane === "road" ? "yellow" : "gray"}>
                  {pickPane === "road" ? "▸ Carretera" : "  Carretera"}
                </text>
                <box flexDirection="column" flexGrow={1}>
                  {roads.map((r, i) => (
                    <text
                      key={r}
                      fg={i === roadIdx ? "black" : pickPane === "road" ? "white" : "gray"}
                      bg={i === roadIdx ? "cyan" : undefined}
                    >
                      {i === roadIdx ? "▸ " : "  "}
                      {r}
                    </text>
                  ))}
                </box>
              </box>
            </>
          )}
        </box>
      )}
    </box>
  );
}
