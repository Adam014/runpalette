import { createCatalog, filterCatalog } from "./catalog.js";
import { loadConfig, type RunpaletteConfig } from "./config.js";
import type { CommandCatalog, PackageManagerName } from "./model.js";
import { discoverProject } from "./project.js";
import { discoverExternalCommands } from "./sources.js";

export interface CatalogRequest {
  cwd: string;
  packageManager?: PackageManagerName;
  config?: string;
  group?: string;
  workspace?: string;
  source?: string;
}

export async function loadCatalog(request: CatalogRequest): Promise<{
  complete: CommandCatalog;
  filtered: CommandCatalog;
  config: RunpaletteConfig;
}> {
  const project = await discoverProject({
    cwd: request.cwd,
    ...(request.packageManager === undefined ? {} : { packageManager: request.packageManager }),
  });
  const config = await loadConfig({
    root: project.root,
    ...(request.config === undefined ? {} : { path: request.config }),
  });
  const external = await discoverExternalCommands(project);
  const complete = createCatalog(project, config, external);
  const filtered = filterCatalog(complete, {
    ...(request.group === undefined ? {} : { group: request.group }),
    ...(request.workspace === undefined ? {} : { workspace: request.workspace }),
    ...(request.source === undefined ? {} : { source: request.source }),
  });
  return { complete, filtered, config };
}

export function catalogWarnings(catalog: CommandCatalog): string[] {
  return [
    ...(catalog.packageManager?.warnings ?? []),
    ...catalog.diagnostics.map((entry) => entry.message),
  ];
}
