"use strict";
"use client";

import { db } from "@/db/client";

export function ComponenteProibidoComPrologo() {
  return <div>{String(db)}</div>;
}
