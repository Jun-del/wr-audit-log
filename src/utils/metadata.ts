export const mergeMetadata = (
  ...sources: Array<Record<string, unknown> | undefined | null>
): Record<string, unknown> | null => {
  const merged: Record<string, unknown> = {};

  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue;
      merged[key] = value;
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
};
