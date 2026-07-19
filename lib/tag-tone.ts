export function tagTone(value: string) {
  return [...value].reduce((total, character) => total + character.charCodeAt(0), 0) % 4;
}
