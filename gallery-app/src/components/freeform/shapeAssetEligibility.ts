import auditedAssets from './auditedShapeAssets.json';

const revisions: Readonly<Record<string, string>> = auditedAssets;

export function hasAuditedShapeAsset(id: string | null | undefined, file: string): boolean {
  return Boolean(id && file && revisions[id] === file);
}
