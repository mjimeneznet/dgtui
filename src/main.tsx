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

const prov = arg("prov", "28").padStart(2, "0");
const carr = arg("carr", "A-42");
const intervalSec = parseInt(arg("interval", "300"), 10);

const renderer = await createCliRenderer();
createRoot(renderer).render(<App prov={prov} carr={carr} intervalSec={intervalSec} />);
