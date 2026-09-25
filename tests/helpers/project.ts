import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createProject(options: {
  manifest: Record<string, unknown>;
  files?: Record<string, string>;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "runpalette-test-"));
  await writeFile(join(root, "package.json"), `${JSON.stringify(options.manifest, null, 2)}\n`);
  for (const [path, contents] of Object.entries(options.files ?? {})) {
    const absolute = join(root, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, contents);
  }
  return root;
}
