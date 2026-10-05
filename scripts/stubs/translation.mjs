/** Minimal translation stub: passthrough with %(name)s interpolation. */
export const t = (key, params) => {
  if (!params) return key;
  return key.replace(/%\((\w+)\)s/g, (_, name) => String(params[name]));
};
export const styled = () => () => {};
export const useTheme = () => ({});
