import { useState, useEffect, useRef, RefObject } from "react";

interface UseLayoutReturn {
  // États
  zone1Collapsed: boolean;
  zone3Collapsed: boolean;
  zone1Width: number;
  zone3Width: number;
  isResizing: "zone1" | "zone3" | null;
  containerRef: RefObject<HTMLDivElement | null>;

  // Setters
  setZone1Collapsed: (collapsed: boolean) => void;
  setZone3Collapsed: (collapsed: boolean) => void;
  setIsResizing: (resizing: "zone1" | "zone3" | null) => void;

  // Helpers
  toggleZone1: () => void;
  toggleZone3: () => void;
}

export function useLayout(): UseLayoutReturn {
  // États des zones rétractables
  const [zone1Collapsed, setZone1Collapsed] = useState(false);
  const [zone3Collapsed, setZone3Collapsed] = useState(false);

  // Largeurs des zones (en pourcentage)
  const [zone1Width, setZone1Width] = useState(25);
  const [zone3Width, setZone3Width] = useState(20);
  const [isResizing, setIsResizing] = useState<"zone1" | "zone3" | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Gestion du redimensionnement des zones
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;

      if (isResizing === "zone1") {
        const newWidth = ((e.clientX - containerRect.left) / containerWidth) * 100;
        // Limiter entre 15% et 50%
        setZone1Width(Math.min(50, Math.max(15, newWidth)));
      } else if (isResizing === "zone3") {
        const newWidth = ((containerRect.right - e.clientX) / containerWidth) * 100;
        // Limiter entre 10% et 35%
        setZone3Width(Math.min(35, Math.max(10, newWidth)));
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
  }, [isResizing]);

  // Helpers
  const toggleZone1 = () => setZone1Collapsed((prev) => !prev);
  const toggleZone3 = () => setZone3Collapsed((prev) => !prev);

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
    toggleZone1,
    toggleZone3,
  };
}
