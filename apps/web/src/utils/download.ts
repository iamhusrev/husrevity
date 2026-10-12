/**
 * Saves a Blob as a file through a temporary link. The link is always removed and the
 * object URL always revoked: right away when the click throws, otherwise on the next
 * task so the browser has started the download before the URL goes away.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
