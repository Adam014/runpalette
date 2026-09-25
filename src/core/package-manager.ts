import { access } from "node:fs/promises";
import { join } from "node:path";
import { RunpaletteError } from "./errors.js";
import type { PackageManagerName, PackageManagerResolution, ProjectManifest } from "./model.js";
import { PACKAGE_MANAGERS } from "./model.js";

interface LockfileDefinition {
  name: string;
  manager: PackageManagerName;
}

const LOCKFILES: readonly LockfileDefinition[] = [
  { name: "bun.lock", manager: "bun" },
  { name: "bun.lockb", manager: "bun" },
  { name: "pnpm-lock.yaml", manager: "pnpm" },
  { name: "yarn.lock", manager: "yarn" },
  { name: "package-lock.json", manager: "npm" },
  { name: "npm-shrinkwrap.json", manager: "npm" },
];

function isPackageManagerName(value: string): value is PackageManagerName {
  return PACKAGE_MANAGERS.includes(value as PackageManagerName);
}

function declaredManager(value: string | undefined): PackageManagerName | undefined {
  if (value === undefined) return undefined;
  const name = value.split("@", 1)[0]?.toLowerCase();
  if (name !== undefined && isPackageManagerName(name)) return name;
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePackageManager(options: {
  root: string;
  manifest: ProjectManifest;
  explicit?: string;
}): Promise<PackageManagerResolution> {
  if (options.explicit !== undefined) {
    if (!isPackageManagerName(options.explicit)) {
      throw new RunpaletteError(
        "PACKAGE_MANAGER_INVALID",
        `Unsupported package manager: ${options.explicit}`,
        `Use one of: ${PACKAGE_MANAGERS.join(", ")}.`,
      );
    }
    return {
      name: options.explicit,
      evidence: { source: "explicit", detail: `--package-manager ${options.explicit}` },
      warnings: [],
    };
  }

  const declared = declaredManager(options.manifest.packageManager);
  if (declared !== undefined) {
    return {
      name: declared,
      evidence: {
        source: "packageManager",
        detail: options.manifest.packageManager ?? declared,
      },
      warnings: [],
    };
  }

  const found = (
    await Promise.all(
      LOCKFILES.map(async (definition) => ({
        ...definition,
        present: await exists(join(options.root, definition.name)),
      })),
    )
  ).filter((definition) => definition.present);

  if (found.length > 0) {
    const selected = found[0];
    if (selected === undefined) throw new Error("Lockfile resolution invariant failed.");
    const managers = [...new Set(found.map((definition) => definition.manager))];
    const warnings =
      managers.length > 1
        ? [
            `Conflicting lockfiles detected (${found.map((item) => item.name).join(", ")}); using ${selected.manager} from ${selected.name}.`,
          ]
        : [];
    return {
      name: selected.manager,
      evidence: { source: "lockfile", detail: selected.name },
      warnings,
    };
  }

  return {
    name: "npm",
    evidence: { source: "fallback", detail: "No package manager declaration or lockfile" },
    warnings: ["No package manager metadata found; defaulting to npm."],
  };
}
