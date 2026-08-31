"use client";

import { db } from "../../../db/client";

export function ComponenteImportRelativoProibido() {
  return <div>{String(db)}</div>;
}
