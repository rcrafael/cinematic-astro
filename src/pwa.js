// ═══════════════════════════════════════════════════════════════════
// PWA Installation & Auto-Detection Module (iOS & Android)
// ═══════════════════════════════════════════════════════════════════

let deferredPrompt = null;

export function isAppInstalled() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://') ||
    localStorage.getItem('cinematic_astro_installed') === 'true';
  return isStandalone;
}

export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function initPWA() {
  // 1. Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service worker registration failed:', err);
        });
    });
  }

  const btnHeader = document.getElementById('btn-install-header');
  const banner = document.getElementById('pwa-install-banner');
  const btnBannerInstall = document.getElementById('btn-pwa-install');
  const btnBannerDismiss = document.getElementById('btn-pwa-dismiss');
  const iosModal = document.getElementById('ios-install-modal');
  const btnIosClose = document.getElementById('btn-ios-close');
  const btnIosConfirm = document.getElementById('btn-ios-confirm');

  // If already running standalone as an installed shortcut, hide all install prompts
  if (isAppInstalled()) {
    console.log('[PWA] App is already installed / running in standalone mode.');
    hideAllInstallUI();
    return;
  }

  console.log('[PWA] App is not installed yet. Preparing install options for', isIOS() ? 'iOS' : 'Android/Desktop');

  // 2. Android / Chromium beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt captured');

    if (!isAppInstalled()) {
      showInstallUI();
    }
  });

  // 3. Android appinstalled event
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App was successfully installed!');
    localStorage.setItem('cinematic_astro_installed', 'true');
    deferredPrompt = null;
    hideAllInstallUI();
  });

  // 4. iOS Auto-detection
  if (isIOS() && !isAppInstalled()) {
    // Show install options after short delay to let page settle
    setTimeout(() => {
      showInstallUI();
    }, 1200);
  }

  // 5. Wire Install Actions
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Native Android / Chromium prompt
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] User response to install prompt:', outcome);
      if (outcome === 'accepted') {
        localStorage.setItem('cinematic_astro_installed', 'true');
        hideAllInstallUI();
      }
      deferredPrompt = null;
    } else if (isIOS()) {
      // Open iOS modal guide
      if (iosModal) iosModal.style.display = 'flex';
    } else {
      // Generic fallback (e.g. desktop browser menu instruction or already prompted)
      alert('To add this app to your Home Screen, open your browser menu (⋮) and tap "Install app" or "Add to Home Screen".');
    }
  };

  if (btnHeader) {
    btnHeader.addEventListener('click', handleInstallClick);
  }

  if (btnBannerInstall) {
    btnBannerInstall.addEventListener('click', handleInstallClick);
  }

  if (btnBannerDismiss) {
    btnBannerDismiss.addEventListener('click', () => {
      if (banner) banner.style.display = 'none';
      // Dismiss banner for 2 days
      localStorage.setItem('pwa_banner_dismissed', Date.now().toString());
    });
  }

  // iOS modal close
  if (btnIosClose) {
    btnIosClose.addEventListener('click', () => {
      if (iosModal) iosModal.style.display = 'none';
    });
  }

  if (btnIosConfirm) {
    btnIosConfirm.addEventListener('click', () => {
      if (iosModal) iosModal.style.display = 'none';
    });
  }

  if (iosModal) {
    iosModal.addEventListener('click', (e) => {
      if (e.target === iosModal) {
        iosModal.style.display = 'none';
      }
    });
  }

  function showInstallUI() {
    if (isAppInstalled()) return;

    // Show header install button
    if (btnHeader) {
      btnHeader.style.display = 'inline-flex';
      btnHeader.classList.add('visible');
    }

    // Show floating banner if not dismissed within last 2 days
    const dismissedAt = parseInt(localStorage.getItem('pwa_banner_dismissed') || '0', 10);
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    if (banner && (Date.now() - dismissedAt > twoDaysMs)) {
      banner.style.display = 'flex';
      requestAnimationFrame(() => banner.classList.add('visible'));
    }
  }

  function hideAllInstallUI() {
    if (btnHeader) btnHeader.style.display = 'none';
    if (banner) banner.style.display = 'none';
    if (iosModal) iosModal.style.display = 'none';
  }
}
