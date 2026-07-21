export const MIN_INPUT_LENGTH = 3;

export function isSubmitShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean }) {
  return (event.ctrlKey || event.metaKey) && event.key === "Enter";
}
