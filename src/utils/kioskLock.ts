/**
 * PULSE LAB - Kiosk 互動事件硬性封鎖 (Event Jail) 與維護者暗樁解鎖
 */

let secretTapCount = 0;
let lastTapTime = 0;

export function setupKioskEventJail(onMaintainerUnlock?: () => void): () => void {
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const handleTouchStart = (e: TouchEvent) => {
    // 禁用多指手勢縮放 (Pinch-to-zoom)
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  };

  const handleWheel = (e: WheelEvent) => {
    // 禁用 Ctrl + 滾輪縮放
    if (e.ctrlKey) {
      e.preventDefault();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // 1. 維護者暗樁快捷鍵：Ctrl + Alt + Shift + Q
    if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      onMaintainerUnlock?.();
      return;
    }

    // 2. 封鎖破壞性鍵盤操作 (F5 重新整理、F11/F12 開發者工具、Esc、Ctrl+R/W/U/P/S)
    const blockedKeys = ['F5', 'F11', 'F12', 'Escape'];
    const isCtrlCombo = (e.ctrlKey || e.metaKey) && ['r', 'w', 'u', 'p', 's', 'a'].includes(e.key.toLowerCase());

    if (blockedKeys.includes(e.key) || isCtrlCombo) {
      e.preventDefault();
    }
  };

  window.addEventListener('contextmenu', handleContextMenu);
  window.addEventListener('touchstart', handleTouchStart, { passive: false });
  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('contextmenu', handleContextMenu);
    window.removeEventListener('touchstart', handleTouchStart);
    window.removeEventListener('wheel', handleWheel);
    window.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * 維護者手勢暗樁：連續 5 次快速點擊特定錨點 (如左上角 Logo)
 */
export function handleMaintainerTap(onUnlock: () => void): void {
  const now = performance.now();
  if (now - lastTapTime < 500) {
    secretTapCount++;
    if (secretTapCount >= 5) {
      onUnlock();
      secretTapCount = 0;
    }
  } else {
    secretTapCount = 1;
  }
  lastTapTime = now;
}
