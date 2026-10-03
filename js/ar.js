// AR / 3D preview modal using <model-viewer> (WebXR on Android, Quick Look on iOS).
// model-viewer and the QR library are loaded lazily the first time it opens.

const MODEL_VIEWER = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
let mvLoading = null, qrLoading = null, currentUrl = null;

function loadModule(src) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { type: 'module', src });
    s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src });
    s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}

export const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

/**
 * Open the AR modal.
 * glb: Blob, title: string, shareUrl: string|null (shown as QR on desktop)
 */
export async function openAr({ glb, title, subtitle, shareUrl }) {
  const dlg = document.getElementById('ar-dialog');
  dlg.querySelector('.ar-title').textContent = title;
  dlg.querySelector('.ar-sub').textContent = subtitle || '';
  const holder = dlg.querySelector('.ar-viewer');
  holder.innerHTML = '<div class="ar-loading">Loading 3D viewer…</div>';
  if (!dlg.open) dlg.showModal();

  mvLoading ||= loadModule(MODEL_VIEWER);
  await mvLoading;
  await customElements.whenDefined('model-viewer');
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(glb);

  const mv = document.createElement('model-viewer');
  Object.entries({
    src: currentUrl, ar: '', 'ar-modes': 'webxr quick-look', 'ar-scale': 'fixed', 'ar-placement': 'floor',
    'camera-controls': '', 'touch-action': 'pan-y', 'shadow-intensity': '1', 'environment-image': 'neutral',
    exposure: '1.05', 'camera-orbit': '30deg 60deg auto', alt: title,
  }).forEach(([k, v]) => mv.setAttribute(k, v));
  mv.innerHTML = `<button slot="ar-button" class="ar-launch primary">📱 View in your room</button>
    <div slot="progress-bar"></div>`;
  mv.addEventListener('ar-status', (e) => {
    if (e.detail.status === 'failed') toastAr('AR session failed. Make sure your device supports ARCore/ARKit.');
  });
  holder.replaceChildren(mv);

  const qrBox = dlg.querySelector('.ar-qr');
  const note = dlg.querySelector('.ar-note');
  // model-viewer exposes canActivateAR once it has checked device support.
  setTimeout(() => {
    const can = mv.canActivateAR;
    note.textContent = can
      ? 'Tap “View in your room”, point your camera at the floor, then tap to place. Furniture appears at real-world size.'
      : 'AR needs a phone or tablet (Android with Chrome, or iPhone/iPad with Safari). You can still rotate and zoom the 3D model here.';
  }, 800);

  if (shareUrl && !isMobile()) {
    qrBox.hidden = false;
    const code = qrBox.querySelector('.qr-code');
    code.replaceChildren();
    try {
      qrLoading ||= loadScript(QR_LIB);
      await qrLoading;
      // eslint-disable-next-line no-undef
      new QRCode(code, { text: shareUrl, width: 168, height: 168, correctLevel: QRCode.CorrectLevel.L });
    } catch {
      code.textContent = 'QR unavailable offline.';
    }
  } else {
    qrBox.hidden = true;
  }
}

function toastAr(msg) {
  document.dispatchEvent(new CustomEvent('app-toast', { detail: msg }));
}
