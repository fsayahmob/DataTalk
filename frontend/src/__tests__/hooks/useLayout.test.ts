/**
 * Tests for useLayout hook
 */
import { renderHook, act } from '@testing-library/react';
import { useLayout } from '@/hooks/useLayout';

describe('useLayout', () => {
  beforeEach(() => {
    // Reset body styles before each test
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });

  describe('Initial state', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useLayout());

      expect(result.current.zone1Collapsed).toBe(false);
      expect(result.current.zone3Collapsed).toBe(false);
      expect(result.current.zone1Width).toBe(25);
      expect(result.current.zone3Width).toBe(20);
      expect(result.current.isResizing).toBeNull();
      expect(result.current.containerRef.current).toBeNull();
    });
  });

  describe('setZone1Collapsed', () => {
    it('should collapse zone1', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setZone1Collapsed(true);
      });

      expect(result.current.zone1Collapsed).toBe(true);
    });

    it('should expand zone1', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setZone1Collapsed(true);
      });

      act(() => {
        result.current.setZone1Collapsed(false);
      });

      expect(result.current.zone1Collapsed).toBe(false);
    });
  });

  describe('setZone3Collapsed', () => {
    it('should collapse zone3', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setZone3Collapsed(true);
      });

      expect(result.current.zone3Collapsed).toBe(true);
    });

    it('should expand zone3', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setZone3Collapsed(true);
      });

      act(() => {
        result.current.setZone3Collapsed(false);
      });

      expect(result.current.zone3Collapsed).toBe(false);
    });
  });

  describe('setIsResizing', () => {
    it('should set resizing to zone1', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setIsResizing('zone1');
      });

      expect(result.current.isResizing).toBe('zone1');
    });

    it('should set resizing to zone3', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setIsResizing('zone3');
      });

      expect(result.current.isResizing).toBe('zone3');
    });

    it('should clear resizing', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setIsResizing('zone1');
      });

      act(() => {
        result.current.setIsResizing(null);
      });

      expect(result.current.isResizing).toBeNull();
    });
  });

  describe('Resize behavior', () => {
    it('should set cursor style when resizing starts', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setIsResizing('zone1');
      });

      expect(document.body.style.cursor).toBe('col-resize');
      expect(document.body.style.userSelect).toBe('none');
    });

    it('should clear cursor style when resizing ends via mouseup', () => {
      const { result } = renderHook(() => useLayout());

      act(() => {
        result.current.setIsResizing('zone1');
      });

      // Simulate mouseup event
      act(() => {
        document.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(result.current.isResizing).toBeNull();
      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    });

    it('should resize zone1 on mousemove within limits', () => {
      const { result } = renderHook(() => useLayout());

      // Create a mock container element
      const mockContainer = document.createElement('div');
      Object.defineProperty(mockContainer, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          right: 1000,
          width: 1000,
          top: 0,
          bottom: 500,
          height: 500,
        }),
      });

      // Assign the mock container to the ref
      Object.defineProperty(result.current.containerRef, 'current', {
        writable: true,
        value: mockContainer,
      });

      act(() => {
        result.current.setIsResizing('zone1');
      });

      // Simulate mousemove at 300px (30% of 1000px container)
      act(() => {
        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 300 })
        );
      });

      expect(result.current.zone1Width).toBe(30);
    });

    it('should limit zone1 width to minimum 15%', () => {
      const { result } = renderHook(() => useLayout());

      const mockContainer = document.createElement('div');
      Object.defineProperty(mockContainer, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          right: 1000,
          width: 1000,
          top: 0,
          bottom: 500,
          height: 500,
        }),
      });

      Object.defineProperty(result.current.containerRef, 'current', {
        writable: true,
        value: mockContainer,
      });

      act(() => {
        result.current.setIsResizing('zone1');
      });

      // Simulate mousemove at 50px (5% of container - below minimum)
      act(() => {
        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 50 })
        );
      });

      expect(result.current.zone1Width).toBe(15); // Clamped to minimum
    });

    it('should limit zone1 width to maximum 50%', () => {
      const { result } = renderHook(() => useLayout());

      const mockContainer = document.createElement('div');
      Object.defineProperty(mockContainer, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          right: 1000,
          width: 1000,
          top: 0,
          bottom: 500,
          height: 500,
        }),
      });

      Object.defineProperty(result.current.containerRef, 'current', {
        writable: true,
        value: mockContainer,
      });

      act(() => {
        result.current.setIsResizing('zone1');
      });

      // Simulate mousemove at 700px (70% of container - above maximum)
      act(() => {
        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 700 })
        );
      });

      expect(result.current.zone1Width).toBe(50); // Clamped to maximum
    });

    it('should resize zone3 on mousemove within limits', () => {
      const { result } = renderHook(() => useLayout());

      const mockContainer = document.createElement('div');
      Object.defineProperty(mockContainer, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          right: 1000,
          width: 1000,
          top: 0,
          bottom: 500,
          height: 500,
        }),
      });

      Object.defineProperty(result.current.containerRef, 'current', {
        writable: true,
        value: mockContainer,
      });

      act(() => {
        result.current.setIsResizing('zone3');
      });

      // Simulate mousemove at 750px from left (250px from right = 25%)
      act(() => {
        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 750 })
        );
      });

      expect(result.current.zone3Width).toBe(25);
    });

    it('should limit zone3 width to minimum 10%', () => {
      const { result } = renderHook(() => useLayout());

      const mockContainer = document.createElement('div');
      Object.defineProperty(mockContainer, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          right: 1000,
          width: 1000,
          top: 0,
          bottom: 500,
          height: 500,
        }),
      });

      Object.defineProperty(result.current.containerRef, 'current', {
        writable: true,
        value: mockContainer,
      });

      act(() => {
        result.current.setIsResizing('zone3');
      });

      // Simulate mousemove at 970px (30px from right = 3% - below minimum)
      act(() => {
        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 970 })
        );
      });

      expect(result.current.zone3Width).toBe(10); // Clamped to minimum
    });

    it('should limit zone3 width to maximum 35%', () => {
      const { result } = renderHook(() => useLayout());

      const mockContainer = document.createElement('div');
      Object.defineProperty(mockContainer, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          right: 1000,
          width: 1000,
          top: 0,
          bottom: 500,
          height: 500,
        }),
      });

      Object.defineProperty(result.current.containerRef, 'current', {
        writable: true,
        value: mockContainer,
      });

      act(() => {
        result.current.setIsResizing('zone3');
      });

      // Simulate mousemove at 500px (500px from right = 50% - above maximum)
      act(() => {
        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 500 })
        );
      });

      expect(result.current.zone3Width).toBe(35); // Clamped to maximum
    });

    it('should not resize when not in resizing mode', () => {
      const { result } = renderHook(() => useLayout());

      const initialZone1Width = result.current.zone1Width;
      const initialZone3Width = result.current.zone3Width;

      const mockContainer = document.createElement('div');
      Object.defineProperty(mockContainer, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          right: 1000,
          width: 1000,
          top: 0,
          bottom: 500,
          height: 500,
        }),
      });

      Object.defineProperty(result.current.containerRef, 'current', {
        writable: true,
        value: mockContainer,
      });

      // isResizing is null, so mousemove should not change widths
      act(() => {
        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 400 })
        );
      });

      expect(result.current.zone1Width).toBe(initialZone1Width);
      expect(result.current.zone3Width).toBe(initialZone3Width);
    });

    it('should not resize when containerRef is null', () => {
      const { result } = renderHook(() => useLayout());

      const initialZone1Width = result.current.zone1Width;

      act(() => {
        result.current.setIsResizing('zone1');
      });

      // containerRef.current is null, so mousemove should not change widths
      act(() => {
        document.dispatchEvent(
          new MouseEvent('mousemove', { clientX: 400 })
        );
      });

      expect(result.current.zone1Width).toBe(initialZone1Width);
    });

    it('should clean up event listeners on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { result, unmount } = renderHook(() => useLayout());

      act(() => {
        result.current.setIsResizing('zone1');
      });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('containerRef', () => {
    it('should return a ref object', () => {
      const { result } = renderHook(() => useLayout());

      expect(result.current.containerRef).toBeDefined();
      expect(typeof result.current.containerRef).toBe('object');
      expect('current' in result.current.containerRef).toBe(true);
    });
  });
});
