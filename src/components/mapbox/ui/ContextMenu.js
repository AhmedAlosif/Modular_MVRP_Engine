'use client';
import { useEffect, useRef, useState } from 'react';

export default function ContextMenu({ mapRef, items = [] }) {
  const [menu, setMenu] = useState(null);     // { x, y, lng, lat }
  const lastPDRef = useRef(null);
  const menuRef = useRef(null);               // ⬅ used to detect clicks inside the menu

  const getMapAndContainer = () => {
    const map = mapRef?.current?.getMap?.() || null;
    let container = null;
    if (map && typeof map.getContainer === 'function') {
      container = map.getContainer();
    }
    if (!container) {
      const canvas = document.querySelector('.maplibregl-canvas');
      container = canvas?.parentElement || canvas || document.body;
    }
    return { map, container };
  };

  useEffect(() => {
    const { map, container } = getMapAndContainer();
    if (!container) return;

    const unproject = (pt) => {
      try {
        const m = mapRef?.current?.getMap?.();
        return m ? m.unproject(pt) : { lng: NaN, lat: NaN };
      } catch {
        return { lng: NaN, lat: NaN };
      }
    };

    const onPointerDownCapture = (ev) => {
      const rect = container.getBoundingClientRect();
      const inside =
        ev.clientX >= rect.left && ev.clientX <= rect.right &&
        ev.clientY >= rect.top && ev.clientY <= rect.bottom;

      // Only log right clicks (button===2)
      if (ev.button === 2) {
        console.debug('[ctx] pointerdown(cap)', { btn: ev.button, x: ev.clientX, y: ev.clientY, inside });
      }

      if (ev.button === 2 && inside) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
        lastPDRef.current = {
          x: ev.clientX - rect.left,
          y: ev.clientY - rect.top,
          clientX: ev.clientX,
          clientY: ev.clientY
        };
      }
    };

    const onContextMenuCapture = (ev) => {
      const rect = container.getBoundingClientRect();
      const inside =
        ev.clientX >= rect.left && ev.clientX <= rect.right &&
        ev.clientY >= rect.top && ev.clientY <= rect.bottom;

      console.debug('[ctx] contextmenu(cap)', { x: ev.clientX, y: ev.clientY, inside });
      if (!inside) return;

      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();

      const px = lastPDRef.current?.x ?? (ev.clientX - rect.left);
      const py = lastPDRef.current?.y ?? (ev.clientY - rect.top);
      const { lng, lat } = unproject([px, py]);
      setMenu({ x: px, y: py, lng, lat });
    };

    const onClickCapture = (ev) => {
      // ⬅ Do NOT close if the click is inside the menu
      if (menuRef.current && menuRef.current.contains(ev.target)) return;
      setMenu(null);
    };

    document.addEventListener('pointerdown', onPointerDownCapture, true);
    document.addEventListener('contextmenu', onContextMenuCapture, true);
    document.addEventListener('click', onClickCapture, true);
    console.debug('[ctx] listeners attached (pointerdown+contextmenu, capture)');

    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
      document.removeEventListener('contextmenu', onContextMenuCapture, true);
      document.removeEventListener('click', onClickCapture, true);
      console.debug('[ctx] listeners removed');
    };
  }, [mapRef]);

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bg-white text-sm rounded shadow-md border z-50 min-w-[180px] select-none"
      style={{ left: menu.x + 4, top: menu.y + 4 }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={(e) => { e.stopPropagation(); }}  // extra safety: keep clicks inside from bubbling to doc-capture
    >
      {items.length === 0 ? (
        <div className="px-3 py-2 text-gray-500">No actions</div>
      ) : (
        items.map((it, i) => (
          <button
            key={i}
            className="block w-full text-left px-3 py-2 hover:bg-gray-100"
            onClick={() => {
              try { it.onClick?.({ lng: menu.lng, lat: menu.lat, x: menu.x, y: menu.y }); }
              finally { setMenu(null); }
            }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {it.label}
          </button>
        ))
      )}
    </div>
  );
}
