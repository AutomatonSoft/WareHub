export function parseSiteIdsInput(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
}
