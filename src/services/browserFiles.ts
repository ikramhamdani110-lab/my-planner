/**
 * Browser replacements for Electron's file dialogs.
 *
 * Saving = a normal download (the browser's own "Save as" flow).
 * Opening = a hidden <input type="file">, which is the only way a page is
 * allowed to read a file the user picks.
 */

/** Triggers a download of `content` as `filename`. */
export function downloadFile(filename: string, content: string | Blob) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Lets the user pick one file; resolves null if they cancel. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    // Fired by modern browsers when the picker is dismissed without a choice.
    input.addEventListener('cancel', () => finish(null));
    // Fallback for browsers that never fire `cancel`.
    window.addEventListener('focus', () => setTimeout(() => {
      if (!input.files?.length) finish(null);
    }, 500), { once: true });

    input.click();
  });
}
