#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import { App } from "./app";

const args = process.argv.slice(2);
function arg(flag: string, def: string): string {
  const i = args.indexOf(`--${flag}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const rawProv = arg("prov", "28");
const prov = /^\d{1,2}$/.test(rawProv) ? rawProv.padStart(2, "0") : "28";
if (prov !== rawProv.padStart(2, "0")) {
  console.error(`dgtui: --prov inválido (${rawProv}), usando 28 (Madrid)`);
}

const carr = arg("carr", "A-42");

const rawInterval = arg("interval", "300");
const parsedInterval = parseInt(rawInterval, 10);
const intervalSec = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 300;
if (intervalSec !== parsedInterval) {
  console.error(`dgtui: --interval inválido (${rawInterval}), usando 300 s`);
}

const renderer = await createCliRenderer();
createRoot(renderer).render(<App prov={prov} carr={carr} intervalSec={intervalSec} />);
