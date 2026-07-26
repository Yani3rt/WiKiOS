export function encodeWikiSlugSegments(slug: string, rounds = 1) {
  return slug
    .split("/")
    .filter(Boolean)
    .map((part) => {
      let encoded = part;
      for (let index = 0; index < rounds; index += 1) {
        encoded = encodeURIComponent(encoded);
      }
      return encoded;
    })
    .join("/");
}
