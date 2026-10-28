/**
 * File downloads on hosted pages. The app saves exports and attachments by clicking a download link to a blob.
 * Some hosts block downloads that a page starts itself and offer a save prompt instead (the `downloads` capability
 * of a Claude artifact, for example). Where that prompt exists, the app's download links go through it. Everywhere
 * else they work as before.
 */
import { toast } from '../src/components/ui';

interface SaveApi {
  save(request: { filename: string; data: Blob }): Promise<unknown>;
}

let saveApi: SaveApi | null = null;

const host = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
host?.use?.('downloads')
  .then((ns) => {
    if (ns && typeof (ns as SaveApi).save === 'function') saveApi = ns as SaveApi;
  })
  .catch(() => {
    /* no save prompt here, so download links work as usual */
  });

/** The data behind each object URL the app creates, so a download can be handed over after its URL is revoked. */
const blobs = new Map<string, Blob>();
const createObjectURL = URL.createObjectURL.bind(URL);
const revokeObjectURL = URL.revokeObjectURL.bind(URL);
URL.createObjectURL = (obj: Blob | MediaSource) => {
  const url = createObjectURL(obj);
  if (obj instanceof Blob) blobs.set(url, obj);
  return url;
};
URL.revokeObjectURL = (url: string) => {
  blobs.delete(url);
  revokeObjectURL(url);
};

function explain(code: string | undefined, filename: string) {
  if (code === 'rate_limited') return 'Finish the save prompt that is already open, then try again.';
  if (code === 'rejected_extension' || code === 'extension_not_enabled') return `This page cannot save ${filename}.`;
  return `Could not save ${filename} from this page.`;
}

const nativeClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
  const blob = blobs.get(this.href);
  const filename = this.getAttribute('download');
  if (!saveApi || !blob || !filename) return nativeClick.call(this);
  saveApi.save({ filename, data: blob }).catch((e: { code?: string } | undefined) => {
    if (e?.code !== 'declined') toast(explain(e?.code, filename), 'error');
  });
};
