/**
 * useLayout - Wrapper de compatibilité
 *
 * MIGRATION: Ce hook utilise maintenant useLayoutStore (Zustand) pour l'état.
 * La logique de resize avec containerRef reste dans ce hook car les refs
 * ne peuvent pas être stockées dans Zustand (elles sont mutables).
 */
import { useEffect, useRef, RefObject } from "react";
import { useLayoutStore, type ResizingZone } from "@/stores/useLayoutStore";

interface UseLayoutReturn {
  // États
  zone1Collapsed: boolean;
  zone3Collapsed: boolean;
  zone1Width: number;
  zone3Width: number;
  isResizing: ResizingZone;
  containerRef: RefObject<HTMLDivElement | null>;

  // Setters
  setZone1Collapsed: (collapsed: boolean) => void;
  setZone3Collapsed: (collapsed: boolean) => void;
  setIsResizing: (resizing: ResizingZone) => void;
}

/**
 * Hook qui combine le store Zustand avec la logique de resize
 */
export function useLayout(): UseLayoutReturn {
  // Get state from store
  const zone1Collapsed = useLayoutStore((state) => state.zone1Collapsed);
  const zone3Collapsed = useLayoutStore((state) => state.zone3Collapsed);
  const zone1Width = useLayoutStore((state) => state.zone1Width);
  const zone3Width = useLayoutStore((state) => state.zone3Width);
  const isResizing = useLayoutStore((state) => state.isResizing);

  // Get actions from store
  const setZone1Collapsed = useLayoutStore((state) => state.setZone1Collapsed);
  const setZone3Collapsed = useLayoutStore((state) => state.setZone3Collapsed);
  const setZone1Width = useLayoutStore((state) => state.setZone1Width);
  const setZone3Width = useLayoutStore((state) => state.setZone3Width);
  const setIsResizing = useLayoutStore((state) => state.setIsResizing);

  // Ref for container (cannot be stored in Zustand)
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize logic (uses ref, must stay in hook)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;

      if (isResizing === "zone1") {
        const newWidth = ((e.clientX - containerRect.left) / containerWidth) * 100;
        setZone1Width(newWidth);
      } else if (isResizing === "zone3") {
        const newWidth = ((containerRect.right - e.clientX) / containerWidth) * 100;
        setZone3Width(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    if (isResizing) {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setZone1Width, setZone3Width, setIsResizing]);

  return {
    zone1Collapsed,
    zone3Collapsed,
    zone1Width,
    zone3Width,
    isResizing,
    containerRef,
    setZone1Collapsed,
    setZone3Collapsed,
    setIsResizing,
  };
}
