import { EnrichmentAdapter } from "./types";
import { prospeoAdapter } from "./adapters/prospeo";
import { findymailAdapter } from "./adapters/findymail";
import { betterContactAdapter } from "./adapters/bettercontact";
import { datagmaAdapter } from "./adapters/datagma";
import { snovAdapter } from "./adapters/snov";
import { fullEnrichAdapter } from "./adapters/fullenrich";

export const adapterRegistry: Record<string, EnrichmentAdapter> = {
  prospeo: prospeoAdapter,
  findymail: findymailAdapter,
  bettercontact: betterContactAdapter,
  datagma: datagmaAdapter,
  snov: snovAdapter,
  fullenrich: fullEnrichAdapter,
};

export function getAdapter(key: string): EnrichmentAdapter | undefined {
  return adapterRegistry[key];
}
