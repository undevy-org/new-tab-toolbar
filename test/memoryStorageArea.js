import { cloneValue } from "../src/storeUtils.js";

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function createMemoryStorageArea(
  initialValues = {},
  { quotaBytesPerItem = Infinity, quotaBytes = Infinity } = {}
) {
  const values = cloneValue(initialValues);

  return {
    async get(key) {
      if (Array.isArray(key)) {
        return Object.fromEntries(
          key
            .filter((itemKey) => Object.hasOwn(values, itemKey))
            .map((itemKey) => [itemKey, cloneValue(values[itemKey])])
        );
      }

      if (typeof key === "string") {
        return Object.hasOwn(values, key) ? { [key]: cloneValue(values[key]) } : {};
      }

      if (key !== null && typeof key === "object") {
        return Object.fromEntries(
          Object.entries(key).map(([itemKey, defaultValue]) => [
            itemKey,
            Object.hasOwn(values, itemKey)
              ? cloneValue(values[itemKey])
              : cloneValue(defaultValue)
          ])
        );
      }

      return cloneValue(values);
    },

    async set(nextValues) {
      for (const [itemKey, value] of Object.entries(nextValues)) {
        if (byteLength(value) > quotaBytesPerItem) {
          throw new Error(`QUOTA_BYTES_PER_ITEM quota exceeded for key "${itemKey}"`);
        }
      }

      const merged = { ...values, ...nextValues };
      const totalBytes = Object.entries(merged).reduce(
        (sum, [itemKey, value]) => sum + byteLength(itemKey) + byteLength(value),
        0
      );
      if (totalBytes > quotaBytes) {
        throw new Error("QUOTA_BYTES quota exceeded");
      }

      Object.assign(values, cloneValue(nextValues));
    },

    async remove(key) {
      if (Array.isArray(key)) {
        for (const itemKey of key) {
          delete values[itemKey];
        }
        return;
      }

      delete values[key];
    }
  };
}
